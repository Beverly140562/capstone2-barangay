
from collections import Counter
from typing import Any


def normalize(value: Any) -> str:
    if value is None:
        return ""
    return str(value).strip()


def normalize_status(value: Any) -> str:
    return (
        normalize(value)
        .lower()
        .replace("_", " ")
        .replace("-", " ")
    )


def calculate_analytics(
    households: list[dict],
    validations: list[dict],
    distributions: list[dict],
):
    # =========================================================
    # TOTAL HOUSEHOLDS
    # =========================================================
    total_households = len(households)

    # =========================================================
    # HOUSEHOLDS BY PUROK
    # =========================================================
    purok_counter = Counter()

    for household in households:
        purok = normalize(household.get("purok")) or "Unknown"
        purok_counter[purok] += 1

    by_purok = [
        {"purok": purok, "n": count}
        for purok, count in sorted(purok_counter.items())
    ]

    # =========================================================
    # HOUSEHOLDS BY VULNERABILITY
    # =========================================================
    vulnerability_counter = Counter()

    for household in households:
        vulnerability = (
            normalize(household.get("vulnerability"))
            or "Unclassified"
        )
        vulnerability_counter[vulnerability] += 1

    by_vulnerability = [
        {"vulnerability": vulnerability, "n": count}
        for vulnerability, count in sorted(
            vulnerability_counter.items(),
            key=lambda item: (-item[1], item[0]),
        )
    ]



    # =========================================================
    # HIGHLY VULNERABLE HOUSEHOLDS
    # =========================================================
    highly_vulnerable = sum(
        1
        for household in households
        if normalize_status(
            household.get("vulnerability")
        ) in {
            "highly vulnerable",
            "high",
            "high vulnerability",
        }
    )

    # =========================================================
    # ASSISTANCE DISTRIBUTION
    # Count only released assistance records.
    # =========================================================
    program_counter = Counter()

    released_statuses = {
        "released",
        "distributed",
        "completed",
        "claimed",
        "received",
    }

    for item in distributions:
        program_name = (
            normalize(item.get("program_name"))
            or normalize(item.get("program"))
            or "Unknown Program"
        )

        release_status = normalize_status(
            item.get(
                "release_status",
                item.get("status"),
            )
        )

        if release_status not in released_statuses:
            continue

        # Support either a release date or a distribution date.
        release_date = item.get("release_date")
        if release_date is None:
            release_date = item.get("distribution_date")

        if release_date is None:
            continue

        program_counter[program_name] += 1

    distribution = [
        {
            "program_name": program,
            "released": count,
        }
        for program, count in sorted(
            program_counter.items(),
            key=lambda item: (-item[1], item[0]),
        )
    ]

    
    # =========================================================
    # BENEFICIARY VALIDATION
    # Staff submission -> Captain approval/rejection
    # =========================================================
    submitted_household_ids = set()
    approved_household_ids = set()
    decided_application_count = 0
    approved_application_count = 0
    rejected_application_count = 0
    pending_application_count = 0

    for record in validations:
        household_id = normalize(record.get("household_id"))

        status = normalize_status(
            record.get("validation_status", record.get("status"))
        )

        # Count households submitted for at least one program.
        if household_id:
            submitted_household_ids.add(household_id)

        # Count application decisions, not just unique households.
        if status == "approved":
            approved_application_count += 1
            if household_id:
                approved_household_ids.add(household_id)

        elif status == "rejected":
            rejected_application_count += 1

        elif status == "pending":
            pending_application_count += 1

        if status in {"approved", "rejected"}:
            decided_application_count += 1

    submitted_household_count = len(submitted_household_ids)
    approved_household_count = len(approved_household_ids)

    # Coverage = households submitted by staff / all households.
    application_coverage = (
        round(
            submitted_household_count / total_households * 100
        )
        if total_households > 0
        else 0
    )

    # Approval rate = approved applications / decided applications.
    approval_rate = (
        round(
            approved_application_count
            / decided_application_count
            * 100
        )
        if decided_application_count > 0
        else 0
    )

    # Group statuses for frontend charts or summaries.
    status_counter = Counter()

    for record in validations:
        status = normalize_status(
            record.get("validation_status", record.get("status"))
        )

        if status in {"pending", "approved", "rejected"}:
            status_counter[status.title()] += 1

    validation_records = [
        {"status": status, "n": count}
        for status, count in sorted(status_counter.items())
    ]

    # =========================================================
    # RESPONSE
    # =========================================================
    return {
        "total_households": total_households,
        "by_purok": by_purok,
        "by_vulnerability": by_vulnerability,
        "distribution": distribution,

        # Staff submissions and captain decisions
        "submitted_household_count": submitted_household_count,
        "approved_household_count": approved_household_count,
        "approved_application_count": approved_application_count,
        "rejected_count": rejected_application_count,
        "decided_household_count": decided_application_count,
        "pending_count": pending_application_count,
        "application_coverage": application_coverage,
        "approval_rate": approval_rate,

        # Raw records let the frontend inspect individual applications.
        "beneficiary_validation": validations,
        "validation_records": validation_records,

        "highly_vulnerable": highly_vulnerable,

        # Keep old fields if existing frontend code still expects them.
        "validated_household_count": 0,
        "total_validation_records": len(validations),
        "coverage": application_coverage,
    }
