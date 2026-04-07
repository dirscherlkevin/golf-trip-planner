from pydantic import BaseModel, model_validator
from datetime import date

class DateRange(BaseModel):
    start_date: date
    end_date: date

    @model_validator(mode="after")
    def validate_range(self):
        if self.end_date < self.start_date:
            raise ValueError("end_date must be on or after start_date")
        return self

class AvailabilityCreate(BaseModel):
    date_ranges: list[DateRange]

class OverlapDay(BaseModel):
    date: date
    count: int  # number of members available on this day

class OverlapOut(BaseModel):
    days: list[OverlapDay]
    total_members: int
