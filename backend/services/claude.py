import os
import json
from anthropic import Anthropic

def _client() -> Anthropic:
    api_key = os.getenv("ANTHROPIC_API_KEY")
    if not api_key or api_key.startswith("sk-ant-REPLACE"):
        raise RuntimeError("ANTHROPIC_API_KEY is not configured")
    return Anthropic(api_key=api_key)

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
) -> list[dict]:
    """Generate 3 destination suggestions. Returns list of destination dicts."""
    budget_note = ""
    if budget_median:
        budget_note = f"Group median budget: ${budget_median:,.0f}/person."
    if budget_max:
        budget_note += f" Max budget: ${budget_max:,.0f}/person."

    prompt = f"""You are a golf travel expert. Suggest 3 golf destinations for a group trip.

Trip details:
- Dates: {trip_start} to {trip_end}
- Group size: {group_size} people
- Skill mix: {skill_mix}
- Country: {country}
- Budget tier filter: {tier_filter}
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
    message = client.messages.create(
        model="claude-opus-4-7",
        max_tokens=4096,
        messages=[{"role": "user", "content": prompt}],
    )
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


def generate_courses_for_round(
    destination: str,
    tier: str,
    round_number: int,
    existing_course_names: list[str],
) -> list[dict]:
    """Generate 3-4 course options for a specific round at a given tier near a destination."""
    exclude_note = ""
    if existing_course_names:
        exclude_note = f"Exclude these courses already nominated: {', '.join(existing_course_names)}."

    prompt = f"""You are a golf course expert. Suggest 3-4 courses for Round {round_number} of a golf trip.

Round details:
- Destination/area: {destination}
- Tier: {tier} (premium = top-rated/expensive, midrange = great value $100-200, value = affordable under $100)
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
  "rating_source": "Golf Digest / GolfAdvisor / local"
}}

Return only the JSON array, no other text."""

    client = _client()
    message = client.messages.create(
        model="claude-opus-4-7",
        max_tokens=2048,
        messages=[{"role": "user", "content": prompt}],
    )
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

Return only the JSON array, no other text."""

    client = _client()
    message = client.messages.create(
        model="claude-opus-4-7",
        max_tokens=2048,
        messages=[{"role": "user", "content": prompt}],
    )
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
