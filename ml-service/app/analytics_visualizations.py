
import io
import math
from html import escape

import pandas as pd

WIDTH = 800
HEIGHT = 650


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

    for row in records or []:
        label = str(row.get("vulnerability") or "Not Classified")
        counts[label] = counts.get(label, 0) + 1

    svg = _svg_start("Household Vulnerability Distribution")

    if not counts:
        svg += '''
        <text x="400" y="250" text-anchor="middle"
              font-family="Arial" font-size="18">
            No data available
        </text>
        '''
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
              font-family="Arial" font-size="18">
            {escape(label)}
        </text>
        <rect x="{chart_left}" y="{y}" width="{bar_width:.2f}"
              height="{bar_height}" fill="#6E2430" rx="5"/>
        <text x="{chart_left + bar_width + 10}" y="{y + 27}"
              font-family="Arial" font-size="18">{count}</text>
        '''

    return _image(svg + _svg_end())


def create_income_chart(records):
    values = []

    for row in records or []:
        value = _number(row.get("household_monthly_income"))
        if value is not None and value >= 0:
            values.append(value)

    svg = _svg_start("Household Monthly Income Distribution")

    if not values:
        svg += '''
        <text x="400" y="250" text-anchor="middle"
              font-family="Arial" font-size="18">
            No income data available
        </text>
        '''
        return _image(svg + _svg_end())

    left, top = 100, 100
    chart_width, chart_height = 620, 320

    minimum = min(values)
    maximum = max(values)

    if minimum == maximum:
        padding = max(minimum * 0.10, 1000)
        minimum = max(0, minimum - padding)
        maximum += padding

    bin_count = min(10, max(1, len(values)))
    bin_width = (maximum - minimum) / bin_count
    counts = [0] * bin_count

    for value in values:
        index = int((value - minimum) / bin_width)
        index = min(index, bin_count - 1)
        counts[index] += 1

    max_count = max(counts) or 1
    bar_width = chart_width / bin_count

    svg += f'''
    <line x1="{left}" y1="{top + chart_height}"
          x2="{left + chart_width}" y2="{top + chart_height}"
          stroke="#333" stroke-width="2"/>
    <line x1="{left}" y1="{top}"
          x2="{left}" y2="{top + chart_height}"
          stroke="#333" stroke-width="2"/>
    '''

    for index, count in enumerate(counts):
        bar_height = count / max_count * chart_height
        x = left + index * bar_width
        y = top + chart_height - bar_height

        range_start = minimum + index * bin_width
        range_end = range_start + bin_width

        svg += f'''
        <rect x="{x + 2}" y="{y:.2f}"
              width="{max(0, bar_width - 4):.2f}"
              height="{bar_height:.2f}"
              fill="#6E2430" rx="3"/>
        <text x="{x + bar_width / 2}" y="{top + chart_height + 20}"
              text-anchor="middle" font-family="Arial" font-size="9">
            {index + 1}
        </text>
        <title>₱{range_start:,.0f} – ₱{range_end:,.0f}: {count} households</title>
        '''

    svg += f'''
    <text x="410" y="485" text-anchor="middle"
          font-family="Arial" font-size="14">
        Income range: ₱{minimum:,.0f} – ₱{maximum:,.0f}
    </text>
    <text x="25" y="260" text-anchor="middle"
          transform="rotate(-90 25 260)"
          font-family="Arial" font-size="14">
        Number of households
    </text>
    <text x="410" y="520" text-anchor="middle"
          font-family="Arial" font-size="13">
        Income groups (see range above)
    </text>
    <text x="400" y="75" text-anchor="middle"
          font-family="Arial" font-size="13">
        {len(values)} households
    </text>
    '''

    return _image(svg + _svg_end())



def create_feature_relationship_chart(records):
    """
    Pearson correlation heatmap using actual household data.

    Features:
    - member_count
    - household_monthly_income

    Does not invent scoring columns, weights, or values.
    """

    numeric_columns = [
        "member_count",
        "household_monthly_income",
    ]

    svg = _svg_start("Household Data Correlation Heatmap")

    if not records:
        svg += '''
        <text x="400" y="250" text-anchor="middle"
              font-family="Arial" font-size="18">
            No household data available
        </text>
        '''
        return _image(svg + _svg_end())

    # Extract actual numeric values.
    pairs = []

    for row in records:
        member_count = _number(row.get("member_count"))
        income = _number(row.get("household_monthly_income"))

        if member_count is None or income is None:
            continue

        pairs.append((member_count, income))

    if len(pairs) < 2:
        svg += '''
        <text x="400" y="250" text-anchor="middle"
              font-family="Arial" font-size="17">
            Not enough numeric household records.
        </text>
        '''
        return _image(svg + _svg_end())

    x_values = [pair[0] for pair in pairs]
    y_values = [pair[1] for pair in pairs]

    x_mean = sum(x_values) / len(x_values)
    y_mean = sum(y_values) / len(y_values)

    x_diff = [value - x_mean for value in x_values]
    y_diff = [value - y_mean for value in y_values]

    numerator = sum(
        x * y for x, y in zip(x_diff, y_diff)
    )

    x_variance = sum(x * x for x in x_diff)
    y_variance = sum(y * y for y in y_diff)

    denominator = math.sqrt(
        x_variance * y_variance
    )

    correlation_value = (
        numerator / denominator
        if denominator > 0
        else None
    )

    # Build the correlation matrix.
    correlation = [
        [1.0, correlation_value],
        [correlation_value, 1.0],
    ]

    columns = numeric_columns

    cell = 130
    left = 250
    top = 180

    for row_index, row_name in enumerate(columns):

        y = top + row_index * cell

        svg += f'''
        <text x="{left - 12}" y="{y + cell / 2 + 5}"
              text-anchor="end"
              font-family="Arial" font-size="14">
            {escape(row_name)}
        </text>
        '''

        for col_index, col_name in enumerate(columns):

            value = correlation[row_index][col_index]

            if value is None:
                color = "rgb(230,230,230)"
                label = "N/A"

            else:
                value = max(-1.0, min(1.0, value))
                intensity = int(abs(value) * 255)

                if value < 0:
                    color = (
                        f"rgb(255,{255-intensity},"
                        f"{255-intensity})"
                    )
                else:
                    color = (
                        f"rgb({255-intensity},"
                        f"{255-intensity},255)"
                    )

                label = f"{value:.2f}"

            x = left + col_index * cell

            svg += f'''
            <rect x="{x}" y="{y}"
                  width="{cell}" height="{cell}"
                  fill="{color}"
                  stroke="white" stroke-width="2"/>

            <text x="{x + cell / 2}"
                  y="{y + cell / 2 + 5}"
                  text-anchor="middle"
                  font-family="Arial" font-size="18">
                {label}
            </text>
            '''

    svg += f'''
    <text x="400" y="570" text-anchor="middle"
          font-family="Arial" font-size="13">
        Pearson correlation | {len(pairs)} household records
    </text>
    '''

    return _image(svg + _svg_end())