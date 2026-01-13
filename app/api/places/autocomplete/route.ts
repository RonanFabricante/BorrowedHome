import { NextRequest, NextResponse } from "next/server";

// In-memory cache (simple MVP - use Redis/KV in production)
interface CacheEntry {
  data: any;
  expiresAt: number;
}

const cache = new Map<string, CacheEntry>();
const CACHE_TTL = 24 * 60 * 60 * 1000; // 24 hours

// Rate limiting (simple in-memory - use Redis/Upstash in production)
interface RateLimitEntry {
  count: number;
  resetAt: number;
}

const rateLimits = new Map<string, RateLimitEntry>();
const RATE_LIMIT_WINDOW = 60 * 1000; // 1 minute
const RATE_LIMIT_MAX = 30; // 30 requests per minute

function getClientIP(request: NextRequest): string {
  const forwarded = request.headers.get("x-forwarded-for");
  if (forwarded) {
    return forwarded.split(",")[0].trim();
  }
  const realIP = request.headers.get("x-real-ip");
  if (realIP) {
    return realIP;
  }
  return "unknown";
}

function checkRateLimit(ip: string): boolean {
  const now = Date.now();
  const entry = rateLimits.get(ip);

  if (!entry || now > entry.resetAt) {
    rateLimits.set(ip, {
      count: 1,
      resetAt: now + RATE_LIMIT_WINDOW,
    });
    return true;
  }

  if (entry.count >= RATE_LIMIT_MAX) {
    return false;
  }

  entry.count++;
  return true;
}

function getCacheKey(
  q: string,
  limit: number,
  language: string,
  country?: string,
  proximity?: string,
  types?: string
): string {
  return `autocomplete:${q.toLowerCase().trim()}:${limit}:${language}:${country || ""}:${proximity || ""}:${types || ""}`;
}

function normalizeMapboxResult(feature: any): {
  id: string;
  label: string;
  placeType: string;
  country: string | null;
  region: string | null;
  city: string | null;
  suburb: string | null;
  postcode: string | null;
  lng: number;
  lat: number;
} {
  const context = feature.context || [];
  const properties = feature.properties || {};

  // Extract context fields
  let country: string | null = null;
  let region: string | null = null;
  let city: string | null = null;
  let suburb: string | null = null;
  let postcode: string | null = null;

  for (const ctx of context) {
    const id = ctx.id || "";
    if (id.startsWith("country")) {
      country = ctx.text || null;
    } else if (id.startsWith("region")) {
      region = ctx.text || null;
    } else if (id.startsWith("place")) {
      city = ctx.text || null;
    } else if (id.startsWith("neighborhood") || id.startsWith("locality")) {
      suburb = ctx.text || null;
    } else if (id.startsWith("postcode")) {
      postcode = ctx.text || null;
    }
  }

  // Determine place type
  const placeType = feature.place_type?.[0] || feature.properties?.category || "unknown";
  const featureText = feature.text || feature.place_name?.split(",")[0] || "";

  // Build display label - use feature's own text as primary label
  let label: string;
  if (placeType === "address") {
    // For addresses: use the full place_name (e.g., "123 Main St, Surry Hills, NSW, Australia")
    label = feature.place_name || featureText || "";
  } else if (placeType === "neighborhood" || placeType === "locality" || placeType === "district") {
    // For suburbs/localities: "Suburb, Region, Country"
    const parts: string[] = [featureText];
    if (region && region !== featureText) parts.push(region);
    if (country) parts.push(country);
    label = parts.join(", ");
  } else if (placeType === "place") {
    // For cities: "City, Region, Country"
    const parts: string[] = [featureText];
    if (region && region !== featureText) parts.push(region);
    if (country) parts.push(country);
    label = parts.join(", ");
  } else {
    // Fallback: use place_name if available
    label = feature.place_name || featureText || "";
  }

  // Set suburb/city based on place type
  if (placeType === "neighborhood" || placeType === "locality" || placeType === "district") {
    suburb = suburb || featureText;
  } else if (placeType === "place") {
    city = city || featureText;
  }

  return {
    id: feature.id || feature.properties?.mapbox_id || "",
    label,
    placeType,
    country,
    region,
    city,
    suburb,
    postcode,
    lng: feature.geometry?.coordinates?.[0] || 0,
    lat: feature.geometry?.coordinates?.[1] || 0,
  };
}

export async function GET(request: NextRequest) {
  try {
    // Rate limiting
    const ip = getClientIP(request);
    if (!checkRateLimit(ip)) {
      return NextResponse.json(
        { error: "Too many requests. Please try again later." },
        { status: 429 }
      );
    }

    // Get query parameters
    const searchParams = request.nextUrl.searchParams;
    const q = searchParams.get("q");
    const limitParam = searchParams.get("limit");
    const language = searchParams.get("language") || process.env.MAPBOX_DEFAULT_LANGUAGE || "en";
    const country = searchParams.get("country");
    const proximity = searchParams.get("proximity");
    const types = searchParams.get("types"); // Optional: e.g., "address" for street addresses

    // Validation
    if (!q) {
      return NextResponse.json(
        { error: "Query parameter 'q' is required" },
        { status: 400 }
      );
    }

    const trimmedQ = q.trim();
    if (trimmedQ.length < 3) {
      return NextResponse.json(
        { error: "Query must be at least 3 characters" },
        { status: 400 }
      );
    }

    if (trimmedQ.length > 80) {
      return NextResponse.json(
        { error: "Query must be 80 characters or less" },
        { status: 400 }
      );
    }

    const limit = Math.min(Math.max(1, parseInt(limitParam || "6", 10)), 10);

    // Check cache
    const cacheKey = getCacheKey(trimmedQ, limit, language, country || undefined, proximity || undefined, types || undefined);
    const cached = cache.get(cacheKey);
    if (cached && Date.now() < cached.expiresAt) {
      return NextResponse.json({ results: cached.data });
    }

    // Get Mapbox token
    const mapboxToken = process.env.MAPBOX_TOKEN;
    if (!mapboxToken) {
      console.error("[Autocomplete] MAPBOX_TOKEN not configured");
      return NextResponse.json(
        { error: "Service configuration error" },
        { status: 500 }
      );
    }

    const endpoint = process.env.MAPBOX_ENDPOINT || "https://api.mapbox.com/geocoding/v5/mapbox.places";

    // Build Mapbox API URL
    // Use provided types, or default to suburbs/localities (neighborhood and locality first)
    const encodedQuery = encodeURIComponent(trimmedQ);
    const mapboxUrl = new URL(`${endpoint}/${encodedQuery}.json`);
    mapboxUrl.searchParams.set("access_token", mapboxToken);
    mapboxUrl.searchParams.set("autocomplete", "true");
    mapboxUrl.searchParams.set("types", types || "neighborhood,locality,district,place");
    mapboxUrl.searchParams.set("limit", limit.toString());
    mapboxUrl.searchParams.set("language", language);

    if (country) {
      mapboxUrl.searchParams.set("country", country);
    }

    if (proximity) {
      mapboxUrl.searchParams.set("proximity", proximity);
    }

    // Call Mapbox API with timeout
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 3000); // 3 second timeout

    try {
      const response = await fetch(mapboxUrl.toString(), {
        signal: controller.signal,
        headers: {
          "User-Agent": "BorrowedHome/1.0",
        },
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        const errorText = await response.text();
        console.error("[Autocomplete] Mapbox API error:", response.status, errorText);
        return NextResponse.json(
          { error: "Failed to fetch suggestions" },
          { status: 502 }
        );
      }

      const data = await response.json();
      const features = data.features || [];

      // Normalize results
      let normalized = features.map(normalizeMapboxResult);

      // Sort to prioritize suburbs/localities over cities/places
      type NormalizedPlace = ReturnType<typeof normalizeMapboxResult>;
      normalized.sort((a: NormalizedPlace, b: NormalizedPlace) => {
        const priorityOrder: Record<string, number> = {
          neighborhood: 0,
          locality: 1,
          district: 2,
          place: 3,
        };
        const aPriority = priorityOrder[a.placeType] ?? 99;
        const bPriority = priorityOrder[b.placeType] ?? 99;
        return aPriority - bPriority;
      });

      // Cache results
      cache.set(cacheKey, {
        data: normalized,
        expiresAt: Date.now() + CACHE_TTL,
      });

      // Clean up old cache entries (simple cleanup)
      if (cache.size > 1000) {
        const now = Date.now();
        for (const [key, entry] of cache.entries()) {
          if (now > entry.expiresAt) {
            cache.delete(key);
          }
        }
      }

      return NextResponse.json({ results: normalized });
    } catch (error: any) {
      clearTimeout(timeoutId);

      if (error.name === "AbortError") {
        console.error("[Autocomplete] Request timeout");
        return NextResponse.json(
          { error: "Request timeout" },
          { status: 504 }
        );
      }

      console.error("[Autocomplete] Fetch error:", error);
      return NextResponse.json(
        { error: "Failed to fetch suggestions" },
        { status: 502 }
      );
    }
  } catch (error: any) {
    console.error("[Autocomplete] Unexpected error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
