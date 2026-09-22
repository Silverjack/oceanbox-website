import { extractLocations, findLocation } from "../../lib/inventory-location.js";
const json = (status, body) => new Response(JSON.stringify(body), {status, headers: {"content-type":"application/json; charset=utf-8", "cache-control":"no-store"}});
export async function onRequestGet({request}) {
  const params = new URL(request.url).searchParams;
  const query = (params.get("location") || params.get("zip") || params.get("q") || "").trim();
  if (!query || query.length > 120) return json(422, {ok:false, message:"Please enter a city and state/province, or ZIP/postal code."});
  const url = new URL("https://inventory.oceanbox.cn/");
  try {
    const response = await fetch(url, {signal: AbortSignal.timeout(10000), headers:{accept:"text/html"}});
    if (!response.ok) throw new Error("inventory unavailable");
    const locations = extractLocations(await response.text());
    if (!locations.length) throw new Error("inventory unavailable");
    let match;
    const usZip = /^\d{5}(?:-\d{4})?$/.test(query);
    const caPostal = /^[A-Za-z]\d[A-Za-z](?:\s?\d[A-Za-z]\d)?$/.test(query);
    if (usZip || caPostal) {
      // Resolve only a postal place. No unverified 'nearest depot' claims.
      const country = usZip ? "us" : "ca";
      const postal = usZip ? query.slice(0,5) : query.replace(/\s/g, "").slice(0,3).toUpperCase();
      const lookup = await fetch(`https://api.zippopotam.us/${country}/${postal}`, {signal: AbortSignal.timeout(5000)});
      if (!lookup.ok) return json(200, {ok:true, available:false, message:"We could not verify this postal code. Please enter the city and state/province instead."});
      const data = await lookup.json();
      const matches = (data.places || []).map(place => findLocation(`${place['place name']}, ${place['state abbreviation']}`, locations)).filter(Boolean);
      const distinct = [...new Map(matches.map(city => [city.key, city])).values()];
      match = distinct.length === 1 ? distinct[0] : null;
    } else match = findLocation(query, locations);
    if (!match) return json(200, {ok:true, available:false, message:"No exact published location match. Please include the state/province, or contact us to check nearby supply."});
    url.searchParams.set("location", match.key);
    url.searchParams.set("view", "list");
    return json(200, {ok:true, available:true, message:"Published listings found. Availability remains subject to confirmation.", url:url.toString(), location:match.location});
  } catch {
    return json(503, {ok:false, message:"Live lookup is temporarily unavailable. Open Live Inventory or contact us to confirm availability."});
  }
}
