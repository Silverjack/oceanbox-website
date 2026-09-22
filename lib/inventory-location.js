// Match the public inventory's exact city identity; never discard a supplied region.
export const normalize = (value = "") => String(value).normalize("NFKC")
  .toLowerCase().replace(/\./g, "").replace(/[^a-z0-9]+/g, " ").trim();
const regions = { texas: "tx", illinois: "il", california: "ca", maine: "me", oregon: "or", ontario: "on", "british columbia": "bc", quebec: "qc", alberta: "ab", manitoba: "mb", "nova scotia": "ns", "new york": "ny", washington: "wa", georgia: "ga", florida: "fl", virginia: "va", maryland: "md", tennessee: "tn", arizona: "az", colorado: "co", utah: "ut", nevada: "nv", ohio: "oh", michigan: "mi", minnesota: "mn", missouri: "mo", louisiana: "la", alabama: "al", "north carolina": "nc", "south carolina": "sc", pennsylvania: "pa", wisconsin: "wi", saskatchewan: "sk" };
const country = value => ({ usa: "us", "united states": "us", canada: "ca" }[normalize(value)] || normalize(value));
export function matchesLocation(query, city) {
  const name = normalize(city.location || city.label);
  const region = normalize(city.region);
  const nation = country(city.country);
  const q = normalize(query);
  // Portland without a state is deliberately ambiguous.
  if (name === "portland") return false;
  const variants = new Set([name]);
  if (region) {
    for (const r of [region, ...Object.keys(regions).filter(key => regions[key] === region)]) {
      variants.add(`${name} ${r}`);
      if (nation) {
        variants.add(`${name} ${r} ${nation}`);
        variants.add(`${name} ${r} ${nation === "us" ? "usa" : "canada"}`);
        if (nation === "us") variants.add(`${name} ${r} united states`);
      }
    }
  }
  return variants.has(q);
}
const decode = value => value.replace(/&amp;/g, "&").replace(/&#39;/g, "'").replace(/&quot;/g, '"');
export function extractLocations(html) {
  const parse = name => {
    const match = html.match(new RegExp(`const ${name} = (\\[.*?\\]);`));
    if (!match) return [];
    try { return JSON.parse(match[1]); } catch { return []; }
  };
  const locations = parse("INVENTORY_LOCATIONS");
  if (locations.length) return locations;
  const cities = parse("INVENTORY_CITIES");
  const select = html.match(/<select[^>]*data-column=["']location["'][^>]*>([\s\S]*?)<\/select>/i);
  if (select) {
    for (const match of select[1].matchAll(/<option[^>]*value="([^"]*)"[^>]*>([^<]*)<\/option>/gi)) {
      const key = decode(match[1]);
      if (key && key !== "all" && !cities.some(city => city.key === key)) cities.push({key, location: decode(match[2]), region: "", country: ""});
    }
  }
  return cities;
}
export function findLocation(query, locations) {
  const matches = locations.filter(city => matchesLocation(query, city));
  return matches.length === 1 ? matches[0] : null;
}
