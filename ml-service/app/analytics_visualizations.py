
import io
import math
from html import escape


WIDTH = 800
HEIGHT = 550


def _number(value):
    try:
        if value is None:
            return None
        result = float(value)
        return result if math.isfinite(result) else None
    except (TypeError, ValueError):
        return None


def _svg_start(title):
    return f'''<svg xmlns="http://www.w3.org/2000/svg"
        width="{WIDTH}" height="{HEIGHT}"
        viewBox="0 0 {WIDTH} {HEIGHT}">
        <rect width="100%" height="100%" fill="white"/>
        <text x="400" y="38" text-anchor="middle"
            font-family="Arial" font-size="21" font-weight="bold">
            {escape(str(title))}
        </text>'''


def _svg_end():
    return "</svg>"


def _image(svg):
    return io.BytesIO(svg.encode("utf-8"))


def create_vulnerability_chart(records):
    counts = {}

    for row in records:
        label = str(row.get("vulnerability") or "Not Classified")
        counts[label] = counts.get(label, 0) + 1

    svg = _svg_start("Household Vulnerability Distribution")

    if not counts:
        svg += '<text x="400" y="220" text-anchor="middle">No data available</text>'
        return _image(svg + _svg_end())

    maximum = max(counts.values()) or 1
    chart_left = 210
    chart_width = 480
    bar_height = 42
    gap = 24

    for index, (label, count) in enumerate(sorted(counts.items())):
        y = 95 + index * (bar_height + gap)
        bar_width = count / maximum * chart_width

        svg += f'''
        <text x="190" y="{y + 27}" text-anchor="end"
            font-family="Arial" font-size="18">{escape(label)}</text>
        <rect x="{chart_left}" y="{y}" width="{bar_width:.2f}"
            height="{bar_height}" fill="#6E2430" rx="5"/>
        <text x="{chart_left + bar_width + 10}" y="{y + 27}"
            font-family="Arial" font-size="18">{count}</text>
        '''

    return _image(svg + _svg_end())


def create_income_chart(records):

    # Convert database records into a DataFrame.
    df = pd.DataFrame(records)

    # Handle empty records.
    if df.empty:
        df = pd.DataFrame({
            "household_monthly_income": []
        })

    # Ensure income is numeric.
    if "household_monthly_income" not in df.columns:
        df["household_monthly_income"] = 0

    df["household_monthly_income"] = pd.to_numeric(
        df["household_monthly_income"],
        errors="coerce"
    )

    # Remove missing income values.
    df = df.dropna(
        subset=["household_monthly_income"]
    )

    # Create chart.
    plt.figure(figsize=(9, 5))

    if not df.empty:

        sns.histplot(
            data=df,
            x="household_monthly_income",
            bins=20,
            kde=len(df) > 1
        )

    plt.title(
        "Household Monthly Income Distribution",
        fontsize=14,
        fontweight="bold"
    )

    plt.xlabel(
        "Monthly Income (₱)",
        fontsize=11
    )

    plt.ylabel(
        "Number of Households",
        fontsize=11
    )

    plt.ticklabel_format(
        style="plain",
        axis="x"
    )

    plt.tight_layout()

    # Return SVG image for FastAPI.
    image_buffer = io.BytesIO()

    plt.savefig(
        image_buffer,
        format="svg",
        bbox_inches="tight"
    )

    image_buffer.seek(0)

    plt.close()

    return image_buffer


def create_feature_relationship_chart(records):
    features = [
        "monthly_income",
        "family_number",
        "age",
        "length_residency",
        "member_count",
        "family_size",
    ]

    available = [
        feature for feature in features
        if any(_number(row.get(feature)) is not None for row in records)
    ]

    svg = _svg_start("Household Feature Relationships")

    if len(available) < 2:
        svg += '<text x="400" y="220" text-anchor="middle">Insufficient numeric data</text>'
        return _image(svg + _svg_end())

    data = {
        feature: [_number(row.get(feature)) for row in records]
        for feature in available
    }

    def correlation(a, b):
        pairs = [
            (x, y) for x, y in zip(data[a], data[b])
            if x is not None and y is not None
        ]

        if len(pairs) < 2:
            return None

        xs = [p[0] for p in pairs]
        ys = [p[1] for p in pairs]

        mean_x = sum(xs) / len(xs)
        mean_y = sum(ys) / len(ys)

        numerator = sum(
            (x - mean_x) * (y - mean_y)
            for x, y in pairs
        )

        denominator_x = sum((x - mean_x) ** 2 for x in xs)
        denominator_y = sum((y - mean_y) ** 2 for y in ys)

        denominator = math.sqrt(denominator_x * denominator_y)

        if denominator == 0:
            return None

        return numerator / denominator

    cell = min(90, 300 // len(available))
    left = 220
    top = 85

    # Draw row labels and correlation boxes
    for i, first in enumerate(available):
        y = top + i * cell

        svg += f'''
        <text x="{left - 12}" y="{y + cell / 2 + 5}"
            text-anchor="end"
            font-family="Arial"
            font-size="16">{escape(first)}</text>
        '''

        for j, second in enumerate(available):
            x = left + j * cell
            value = correlation(first, second)

            if value is None:
                fill = "#EEEEEE"
                label = "N/A"
            else:
                intensity = int(255 * (1 - abs(value)))

                if value >= 0:
                    fill = f"rgb(255,{intensity},{intensity})"
                else:
                    fill = f"rgb({intensity},{intensity},255)"

                label = f"{value:.2f}"

            svg += f'''
            <rect x="{x}" y="{y}"
                width="{cell - 2}"
                height="{cell - 2}"
                fill="{fill}"
                stroke="#999999"/>

            <text x="{x + (cell - 2) / 2}"
                y="{y + cell / 2 + 5}"
                text-anchor="middle"
                font-family="Arial"
                font-size="20">{label}</text>
            '''

    # Column labels BELOW the correlation boxes, slanted
    for j, feature in enumerate(available):
        x = left + j * cell + cell / 2
        y = top + len(available) * cell + 15

        svg += f'''
        <text x="{x}" y="{y}"
            text-anchor="end"
            transform="rotate(-45 {x} {y})"
            font-family="Arial"
            font-size="20">
            {escape(feature)}
        </text>
        '''

    return _image(svg + _svg_end())

