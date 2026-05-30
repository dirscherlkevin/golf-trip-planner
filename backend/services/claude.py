import os
import json
import time
import random
import logging
from anthropic import Anthropic, RateLimitError, APITimeoutError, APIConnectionError, InternalServerError

logger = logging.getLogger(__name__)

def _client() -> Anthropic:
    api_key = os.getenv("ANTHROPIC_API_KEY")
    if not api_key or api_key.startswith("sk-ant-REPLACE"):
        raise RuntimeError("ANTHROPIC_API_KEY is not configured")
    return Anthropic(api_key=api_key, timeout=50.0)  # 50s timeout, below proxy limits


def _call_with_retry(fn, max_retries=3):
    """Call fn() with exponential backoff on transient API errors."""
    delay = 2.0
    for attempt in range(max_retries + 1):
        try:
            return fn()
        except (RateLimitError, APITimeoutError, APIConnectionError, InternalServerError) as e:
            if attempt == max_retries:
                raise
            wait = delay * (1 + 0.1 * random.random())
            logger.warning(
                "Claude API transient error (attempt %d/%d): %s — retrying in %.1fs",
                attempt + 1, max_retries, type(e).__name__, wait,
            )
            time.sleep(wait)
            delay = min(delay * 2, 30.0)

def _parse_json_response(text: str) -> any:
    """Extract and parse JSON from Claude's response. Raises ValueError if invalid."""
    text = text.strip()
    # Strip markdown code fences if present
    if text.startswith("```"):
        lines = text.split("\n")
        # Remove first line (```json or ```) and last line (```)
        text = "\n".join(lines[1:-1] if lines[-1].strip() == "```" else lines[1:])
    try:
        return json.loads(text)
    except json.JSONDecodeError as e:
        raise ValueError(f"Claude returned invalid JSON: {e}\n\nRaw response: {text[:500]}")


def generate_destinations(
    trip_start: str,
    trip_end: str,
    group_size: int,
    skill_mix: str,
    budget_median: float | None,
    budget_max: float | None,
    country: str,
    tier_filter: str,
    planned_rounds: int = 3,
    region: str = "",
    public_courses_only: bool = True,
) -> list[dict]:
    """Generate 3 destination suggestions. Returns list of destination dicts."""
    budget_note = ""
    if budget_median:
        budget_note = f"Group median budget: ${budget_median:,.0f}/person."
    if budget_max:
        budget_note += f" Max budget: ${budget_max:,.0f}/person."

    region_note = f"\n- Preferred region/area: {region}" if region.strip() else ""
    access_note = "\n- Courses: public access only (no private clubs or members-only courses)" if public_courses_only else ""

    prompt = f"""You are a golf travel expert. Suggest 3 golf destinations for a group trip.

Trip details:
- Dates: {trip_start} to {trip_end}
- Group size: {group_size} people
- Skill mix: {skill_mix}
- Country: {country}{region_note}
- Budget tier filter: {tier_filter}
- Planned rounds: {planned_rounds} rounds of golf
- Lodging assumption: ~$100/person/night (factor this into overall cost; only the green fees portion should be counted in est_cost_per_person_rounds){access_note}
{budget_note}

Return ONLY a JSON array with exactly 3 objects. Each object must have:
{{
  "name": "Destination name",
  "region": "State/region, Country",
  "why_it_fits": "2-3 sentences why this fits this group's dates, budget, and skill level",
  "top_courses": [
    {{
      "name": "Course name",
      "rating": 74.2,
      "slope": 132,
      "est_green_fee": 150,
      "rating_source": "Golf Digest / GolfAdvisor / USGA / etc"
    }}
  ],
  "est_cost_per_person_rounds": 450,
  "booking_warning": "Popular courses book 6-12 months out — check availability early"
}}

The 3 destinations must be geographically diverse. Include 3-5 courses per destination. Calibrate green fees realistically to the budget tier.

Return only the JSON array, no other text."""

    client = _client()
    message = _call_with_retry(lambda: client.messages.create(
        model="claude-opus-4-7",
        max_tokens=4096,
        messages=[{"role": "user", "content": prompt}],
    ))
    raw = message.content[0].text
    data = _parse_json_response(raw)

    if not isinstance(data, list) or len(data) == 0:
        raise ValueError("Expected a non-empty JSON array of destinations")

    required_fields = {"name", "region", "why_it_fits", "top_courses", "est_cost_per_person_rounds"}
    for i, dest in enumerate(data):
        missing = required_fields - set(dest.keys())
        if missing:
            raise ValueError(f"Destination {i} missing required fields: {missing}")
        if not isinstance(dest["top_courses"], list) or len(dest["top_courses"]) == 0:
            raise ValueError(f"Destination {i} has no courses")

    return data


def preview_destination_courses(
    destination_name: str,
    region: str,
    planned_rounds: int = 3,
) -> list[dict]:
    """Return 5-8 recommended courses at a destination for research/preview (not saved to DB)."""
    location_note = f"{destination_name}, {region}" if region.strip() else destination_name

    prompt = f"""You are a golf travel expert. List the top golf courses at this destination.

Destination: {location_note}
Planning: {planned_rounds} rounds of golf

Return ONLY a JSON array of 5-8 courses ordered by prestige/reputation. Each object must have:
{{
  "name": "Course name",
  "location": "City, State",
  "tier": "premium / midrange / value",
  "green_fee": 175,
  "cart_fee": 20,
  "rating": 72.5,
  "slope": 128,
  "par": 72,
  "walking_policy": "Walking allowed / Cart required / Caddie recommended",
  "architect": "Tom Fazio",
  "tee_time_window": "Opens 60 days in advance",
  "rating_source": "Golf Digest / USGA / etc",
  "website": "https://www.coursename.com"
}}

Return only the JSON array, no other text."""

    client = _client()
    message = _call_with_retry(lambda: client.messages.create(
        model="claude-opus-4-7",
        max_tokens=2048,
        messages=[{"role": "user", "content": prompt}],
    ))
    raw = message.content[0].text
    data = _parse_json_response(raw)

    if not isinstance(data, list) or len(data) == 0:
        raise ValueError("Expected a non-empty JSON array of courses")

    return data


def generate_courses_for_round(
    destination: str,
    tier: str,
    round_number: int,
    existing_course_names: list[str],
    public_courses_only: bool = True,
) -> list[dict]:
    """Generate 3-4 course options for a specific round at a given tier near a destination."""
    exclude_note = ""
    if existing_course_names:
        exclude_note = f"Exclude these courses already nominated: {', '.join(existing_course_names)}."

    access_note = "\n- Public access only: no private clubs or members-only courses" if public_courses_only else ""

    prompt = f"""You are a golf course expert. Suggest 3-4 courses for Round {round_number} of a golf trip.

Round details:
- Destination/area: {destination}
- Tier: {tier} (premium = top-rated/expensive, midrange = great value $100-200, value = affordable under $100){access_note}
{exclude_note}

Return ONLY a JSON array. Each object must have:
{{
  "name": "Course name",
  "location": "City, State",
  "rating": 72.5,
  "slope": 128,
  "par": 72,
  "yardage_options": {{"championship": 7200, "member": 6800, "forward": 6200}},
  "green_fee": 175,
  "cart_fee": 20,
  "walking_policy": "Walking allowed / Cart required / Caddie recommended",
  "architect": "Tom Fazio",
  "pace_of_play": "4:15 average",
  "tee_time_window": "Opens 60 days in advance",
  "rating_source": "Golf Digest / GolfAdvisor / USGA (include data year if known, e.g. 'USGA 2024')",
  "website": "https://www.coursename.com (official course booking page)"
}}

Return only the JSON array, no other text."""

    client = _client()
    message = _call_with_retry(lambda: client.messages.create(
        model="claude-opus-4-7",
        max_tokens=2048,
        messages=[{"role": "user", "content": prompt}],
    ))
    raw = message.content[0].text
    data = _parse_json_response(raw)

    if not isinstance(data, list) or len(data) == 0:
        raise ValueError("Expected a non-empty JSON array of courses")

    required_fields = {"name", "location", "rating", "slope", "green_fee"}
    for i, course in enumerate(data):
        missing = required_fields - set(course.keys())
        if missing:
            raise ValueError(f"Course {i} missing required fields: {missing}")

    return data


def enrich_destination(name: str, region: str, planned_rounds: int = 3) -> dict:
    """Ask Claude to fill in full details for a manually-added destination."""
    location = f"{name}, {region}" if region.strip() else name
    prompt = f"""You are a golf travel expert. Provide detailed info for this golf destination.

Destination: {location}
Planned rounds: {planned_rounds}

Return ONLY a JSON object with these exact fields:
{{
  "why_it_fits": "2-3 sentences on why this is a great golf trip destination",
  "est_cost_per_person_rounds": <number, total estimated green fees per person for {planned_rounds} rounds>,
  "top_courses": [
    {{"name": "Course Name", "rating": 74.2, "slope": 135, "est_green_fee": 250, "rating_source": "USGA 2024"}},
    ...3-5 courses
  ],
  "booking_warning": "Any lead-time or access notes, or null"
}}

Return only valid JSON, no other text."""

    client = _client()
    message = _call_with_retry(lambda: client.messages.create(
        model="claude-haiku-4-5-20251001",
        max_tokens=1024,
        messages=[{"role": "user", "content": prompt}],
    ))
    return _parse_json_response(message.content[0].text)


def enrich_course(name: str, location: str) -> dict:
    """Ask Claude to fill in full details for a manually-added course."""
    prompt = f"""You are a golf course expert. Provide accurate details for this course.

Course: {name}
Location: {location}

Return ONLY a JSON object (use null for unknown fields):
{{
  "rating": "74.2",
  "slope": 135,
  "par": 72,
  "green_fee": 250,
  "cart_fee": 25,
  "walking_policy": "Walking allowed",
  "architect": "Designer Name",
  "pace_of_play": "4 hours 15 minutes",
  "tee_time_window": "Book 30 days in advance",
  "website": "https://..."
}}

Return only valid JSON, no other text."""

    client = _client()
    message = _call_with_retry(lambda: client.messages.create(
        model="claude-haiku-4-5-20251001",
        max_tokens=512,
        messages=[{"role": "user", "content": prompt}],
    ))
    return _parse_json_response(message.content[0].text)


def enrich_lodging(name: str, address: str = "", lodging_type: str = "") -> dict:
    """Ask Claude to fill in details for a manually-added lodging option."""
    context = f"{name}"
    if address:
        context += f" at {address}"
    if lodging_type:
        context += f" ({lodging_type})"
    prompt = f"""You are a lodging expert for golf trips. Provide details for this property.

Property: {context}

Return ONLY a JSON object (use null for unknown fields):
{{
  "price_per_night": 450,
  "beds": 4,
  "capacity": 8,
  "distance_to_courses": "5 min drive to nearest courses",
  "amenities": "Pool, hot tub, full kitchen, golf cart storage"
}}

Return only valid JSON, no other text."""

    client = _client()
    message = _call_with_retry(lambda: client.messages.create(
        model="claude-haiku-4-5-20251001",
        max_tokens=256,
        messages=[{"role": "user", "content": prompt}],
    ))
    return _parse_json_response(message.content[0].text)


def generate_lodging(
    destination: str,
    lodging_type: str,
    group_size: int,
    nights: int,
    course_names: list[str],
) -> list[dict]:
    """Generate 3-4 lodging options near a destination."""
    type_instruction = {
        "rental": "Focus on vacation rental houses only (VRBO, Airbnb style). No hotels.",
        "hotel": "Focus on hotels only. No rental houses.",
        "both": "Mix of rental houses and hotels.",
    }.get(lodging_type, "Mix of rental houses and hotels.")

    courses_note = ""
    if course_names:
        courses_note = f"Near these courses: {', '.join(course_names[:3])}."

    prompt = f"""You are a golf trip lodging expert. Suggest 3-4 lodging options.

Trip details:
- Destination: {destination}
- Group size: {group_size} people
- Nights: {nights}
- Lodging type: {type_instruction}
{courses_note}

Return ONLY a JSON array. Each object must have:
{{
  "name": "Property name",
  "type": "rental_house / hotel",
  "price_per_night": 350,
  "beds": 5,
  "capacity": 10,
  "distance_to_courses": "5 min to Course A, 15 min to Course B",
  "booking_link": "https://vrbo.com/... or https://marriott.com/... (realistic placeholder OK)",
  "highlights": "2-sentence description of why this works for a golf group"
}}

IMPORTANT: `price_per_night` must be the TOTAL nightly cost for the entire group — not per person.
For a rental house: total property cost per night.
For a hotel: total cost for all rooms needed for the group per night (e.g., 5 rooms × $189 = $945).
This will be divided by group size to show per-person cost.

Return only the JSON array, no other text."""

    client = _client()
    message = _call_with_retry(lambda: client.messages.create(
        model="claude-opus-4-7",
        max_tokens=2048,
        messages=[{"role": "user", "content": prompt}],
    ))
    raw = message.content[0].text
    data = _parse_json_response(raw)

    if not isinstance(data, list) or len(data) == 0:
        raise ValueError("Expected a non-empty JSON array of lodging options")

    required_fields = {"name", "type", "price_per_night"}
    for i, opt in enumerate(data):
        missing = required_fields - set(opt.keys())
        if missing:
            raise ValueError(f"Lodging option {i} missing required fields: {missing}")

    return data
