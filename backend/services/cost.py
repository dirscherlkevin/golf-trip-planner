from sqlalchemy.orm import Session
from models.trip import Trip, TripMember
from models.round import TripRound, CourseNomination
from models.lodging import LodgingOption


def compute_cost_estimate(trip_id: int, db: Session) -> dict:
    trip = db.query(Trip).filter(Trip.id == trip_id).first()

    # --- Nights ---
    if trip and trip.trip_start and trip.trip_end:
        nights = (trip.trip_end - trip.trip_start).days
    else:
        nights = 3

    # --- Group size ---
    group_size = db.query(TripMember).filter(
        TripMember.trip_id == trip_id,
        TripMember.joined == "joined",
    ).count()
    if group_size == 0:
        group_size = 1  # avoid division by zero

    # --- Rounds estimate ---
    rounds = db.query(TripRound).filter(TripRound.trip_id == trip_id).all()
    round_count = len(rounds)

    rounds_low = 0.0
    rounds_high = 0.0
    any_round_unlocked = False

    for rnd in rounds:
        if rnd.locked_course_id is not None:
            # Use the locked nomination's fees
            nomination = db.query(CourseNomination).filter(
                CourseNomination.id == rnd.locked_course_id
            ).first()
            fee = 0.0
            if nomination and nomination.course_data:
                green_fee = nomination.course_data.get("green_fee")
                cart_fee = nomination.course_data.get("cart_fee")
                fee = (float(green_fee) if green_fee is not None else 0.0) + \
                      (float(cart_fee) if cart_fee is not None else 0.0)
            rounds_low += fee
            rounds_high += fee
        else:
            any_round_unlocked = True
            # Gather all nominations for this round
            nominations = db.query(CourseNomination).filter(
                CourseNomination.round_id == rnd.id
            ).all()
            fees = []
            for nom in nominations:
                if not nom.course_data:
                    continue
                green_fee = nom.course_data.get("green_fee")
                cart_fee = nom.course_data.get("cart_fee")
                if green_fee is not None:
                    fee = float(green_fee) + (float(cart_fee) if cart_fee is not None else 0.0)
                    fees.append(fee)
            if fees:
                rounds_low += min(fees)
                rounds_high += max(fees)
            # else both stay at 0 for this round

    # --- Lodging estimate ---
    any_lodging_unlocked = False

    if trip and trip.locked_lodging_option_id is not None:
        locked_option = db.query(LodgingOption).filter(
            LodgingOption.id == trip.locked_lodging_option_id
        ).first()
        price_per_night = 0.0
        if locked_option and locked_option.option_data:
            ppn = locked_option.option_data.get("price_per_night")
            if ppn is not None:
                price_per_night = float(ppn)
        lodging_low = price_per_night * nights / group_size
        lodging_high = lodging_low
    else:
        options = db.query(LodgingOption).filter(
            LodgingOption.trip_id == trip_id
        ).all()
        prices = []
        for opt in options:
            if not opt.option_data:
                continue
            ppn = opt.option_data.get("price_per_night")
            if ppn is not None:
                prices.append(float(ppn))
        if prices:
            any_lodging_unlocked = True  # only uncertain when options exist but none is locked
            lodging_low = min(prices) * nights / group_size
            lodging_high = max(prices) * nights / group_size
        else:
            lodging_low = 0.0
            lodging_high = 0.0

    is_estimate = any_round_unlocked or any_lodging_unlocked

    return {
        "rounds_estimate_low": rounds_low,
        "rounds_estimate_high": rounds_high,
        "lodging_per_person_low": lodging_low,
        "lodging_per_person_high": lodging_high,
        "total_low": rounds_low + lodging_low,
        "total_high": rounds_high + lodging_high,
        "nights": nights,
        "group_size": group_size,
        "round_count": round_count,
        "is_estimate": is_estimate,
    }
