import pytest
from services.claude import _parse_json_response


def test_parse_valid_destination_json():
    raw = '''[
        {
            "name": "Scottsdale, AZ",
            "region": "Arizona, United States",
            "why_it_fits": "Excellent winter golf with stunning desert scenery.",
            "top_courses": [{"name": "TPC Scottsdale", "rating": 71.9, "slope": 128, "est_green_fee": 250, "rating_source": "Golf Digest"}],
            "est_cost_per_person_rounds": 750,
            "booking_warning": "Book 6-12 months out"
        }
    ]'''
    result = _parse_json_response(raw)
    assert isinstance(result, list)
    assert len(result) == 1
    assert result[0]["name"] == "Scottsdale, AZ"
    assert result[0]["top_courses"][0]["name"] == "TPC Scottsdale"


def test_parse_json_with_markdown_fences():
    raw = '''```json
[{"name": "Test", "region": "TX"}]
```'''
    result = _parse_json_response(raw)
    assert result[0]["name"] == "Test"


def test_parse_markdown_fence_no_language():
    raw = '''```
[{"key": "value"}]
```'''
    result = _parse_json_response(raw)
    assert result[0]["key"] == "value"


def test_parse_invalid_json_raises_value_error():
    with pytest.raises(ValueError, match="invalid JSON"):
        _parse_json_response("This is not JSON at all, just text")


def test_parse_truncated_json_raises_value_error():
    with pytest.raises(ValueError, match="invalid JSON"):
        _parse_json_response('[{"name": "incomplete"')
