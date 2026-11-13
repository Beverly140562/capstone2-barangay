
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
    """
    Household Monthly Income Distribution.
    Lightweight SVG histogram with KDE curve.
    Uses 20 bins, matching the Google Colab chart.
    """

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

    import statistics

    bins = 20
    minimum = min(values)
    maximum = max(values)

    # Avoid zero-width bins when all incomes are identical.
    if minimum == maximum:
        maximum = minimum + 1

    bin_width = (maximum - minimum) / bins

    counts = [0] * bins

    for value in values:
        index = int((value - minimum) / bin_width)
        index = min(index, bins - 1)
        counts[index] += 1

    # Chart dimensions
    left = 95
    right = 760
    top = 95
    bottom = 490

    chart_width = right - left
    chart_height = bottom - top

    max_count = max(counts) or 1
    y_max = max_count * 1.2

    # Background and axes
    svg += f'''
    <line x1="{left}" y1="{bottom}"
          x2="{right}" y2="{bottom}"
          stroke="#333" stroke-width="2"/>

    <line x1="{left}" y1="{top}"
          x2="{left}" y2="{bottom}"
          stroke="#333" stroke-width="2"/>

    <text x="420" y="555"
          text-anchor="middle"
          font-family="Arial" font-size="16">
        Monthly Income (₱)
    </text>

    <text x="25" y="290"
          text-anchor="middle"
          transform="rotate(-90 25 290)"
          font-family="Arial" font-size="16">
        Number of Households
    </text>
    '''

    # Y-axis grid and labels
    for tick in range(5):
        count_value = y_max * tick / 4
        y = bottom - (count_value / y_max) * chart_height

        svg += f'''
        <line x1="{left}" y1="{y:.2f}"
              x2="{right}" y2="{y:.2f}"
              stroke="#ddd" stroke-width="1"/>

        <text x="{left - 12}" y="{y + 5:.2f}"
              text-anchor="end"
              font-family="Arial" font-size="12">
            {count_value:.0f}
        </text>
        '''

    # Histogram bars
    bar_width = chart_width / bins

    for index, count in enumerate(counts):
        height = count / y_max * chart_height
        x = left + index * bar_width
        y = bottom - height

        svg += f'''
        <rect x="{x + 1:.2f}" y="{y:.2f}"
              width="{max(0, bar_width - 2):.2f}"
              height="{height:.2f}"
              fill="#6E2430"
              opacity="0.85"/>
        '''

    # X-axis labels
    for index in range(5):
        income = minimum + (maximum - minimum) * index / 4
        x = left + chart_width * index / 4

        svg += f'''
        <text x="{x:.2f}" y="{bottom + 25}"
              text-anchor="middle"
              font-family="Arial" font-size="11">
            ₱{income:,.0f}
        </text>
        '''

    # KDE curve using Gaussian kernel estimation.
    if len(values) > 1 and len(set(values)) > 1:

        mean = statistics.mean(values)
        std = statistics.stdev(values)

        bandwidth = max(
            1.06 * std * len(values) ** (-0.2),
            bin_width * 0.15,
            1
        )

        points = []
        steps = 100

        for step in range(steps + 1):
            x_value = minimum + (
                maximum - minimum
            ) * step / steps

            density = sum(
                math.exp(
                    -0.5 * ((x_value - value) / bandwidth) ** 2
                )
                for value in values
            )

            density /= (
                len(values)
                * bandwidth
                * math.sqrt(2 * math.pi)
            )

            # Convert density to histogram-count scale.
            estimated_count = density * len(values) * bin_width

            x = left + (
                (x_value - minimum) / (maximum - minimum)
            ) * chart_width

            y = bottom - (
                estimated_count / y_max
            ) * chart_height

            points.append(f"{x:.2f},{y:.2f}")

        svg += f'''
        <polyline points="{' '.join(points)}"
                  fill="none"
                  stroke="#D18B35"
                  stroke-width="3"
                  stroke-linejoin="round"
                  stroke-linecap="round"/>
        '''

    # Total household count
    svg += f'''
    <text x="{right}" y="65"
          text-anchor="end"
          font-family="Arial" font-size="13"
          fill="#555">
        Total households: {len(values)}
    </text>
    '''

    return _image(svg + _svg_end())




def create_feature_relationship_chart(records):
    """
    Pearson correlation heatmap using pure Python.
    Does not use Pandas, NumPy, Matplotlib, or Seaborn.
    Only displays features actually present in the records.
    """

    numeric_columns = [
        "member_count",
        "household_monthly_income",
        "family_size",
    ]

    if not records:
        svg = _svg_start("Household Data Correlation Heatmap")
        svg += """
        <text x="400" y="250" text-anchor="middle"
              font-family="Arial" font-size="16">
            No household data available
        </text>
        """
        return _image(svg + _svg_end())

    available_columns = [
        column for column in numeric_columns
        if any(column in row for row in records)
    ]

    # Convert actual values to numbers without inventing missing values.
    data = {}

    for column in available_columns:
        values = []

        for row in records:
            values.append(_number(row.get(column)))

        if any(value is not None for value in values):
            data[column] = values

    columns = list(data.keys())

    if len(columns) < 2:
        svg = _svg_start("Household Data Correlation Heatmap")
        svg += """
        <text x="400" y="250" text-anchor="middle"
              font-family="Arial" font-size="16">
            Not enough numeric features for correlation
        </text>
        """
        return _image(svg + _svg_end())

    def pearson_correlation(values_a, values_b):
        pairs = [
            (a, b)
            for a, b in zip(values_a, values_b)
            if a is not None and b is not None
        ]

        if len(pairs) < 2:
            return None

        xs = [pair[0] for pair in pairs]
        ys = [pair[1] for pair in pairs]

        mean_x = sum(xs) / len(xs)
        mean_y = sum(ys) / len(ys)

        numerator = sum(
            (x - mean_x) * (y - mean_y)
            for x, y in pairs
        )

        sum_x = sum((x - mean_x) ** 2 for x in xs)
        sum_y = sum((y - mean_y) ** 2 for y in ys)

        denominator = math.sqrt(sum_x * sum_y)

        if denominator == 0:
            return None

        return max(-1.0, min(1.0, numerator / denominator))

    # Calculate the correlation matrix using pure Python.
    correlation = {}

    for row_name in columns:
        correlation[row_name] = {}

        for col_name in columns:
            correlation[row_name][col_name] = pearson_correlation(
                data[row_name],
                data[col_name],
            )

    # Heatmap dimensions.
    cell = 58
    left = 330
    top = 190

    chart_width = left + len(columns) * cell + 80
    chart_height = top + len(columns) * cell + 190

    svg = f"""
    <svg xmlns="http://www.w3.org/2000/svg"
         width="{chart_width}" height="{chart_height}"
         viewBox="0 0 {chart_width} {chart_height}">
        <rect width="100%" height="100%" fill="white"/>

        <text x="{chart_width / 2}" y="40"
              text-anchor="middle"
              font-family="Arial"
              font-size="16"
              font-weight="bold">
            Household Data Correlation Heatmap
        </text>
    """

    for row_index, row_name in enumerate(columns):
        y = top + row_index * cell

        svg += f"""
        <text x="{left - 12}"
              y="{y + cell / 2 + 5}"
              text-anchor="end"
              font-family="Arial"
              font-size="14">
            {escape(row_name)}
        </text>
        """

        for col_index, col_name in enumerate(columns):
            x = left + col_index * cell
            value = correlation[row_name][col_name]

            if value is None:
                color = "rgb(225,225,225)"
                label = "N/A"
            else:
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

            svg += f"""
            <rect x="{x}" y="{y}"
                  width="{cell}" height="{cell}"
                  fill="{color}"
                  stroke="white"
                  stroke-width="2"/>

            <text x="{x + cell / 2}"
                  y="{y + cell / 2 + 4}"
                  text-anchor="middle"
                  font-family="Arial"
                  font-size="14">
                {label}
            </text>
            """

    # X-axis labels.
    for col_index, col_name in enumerate(columns):
        x = left + col_index * cell + cell / 2
        y = top + 10

        svg += f"""
        <text x="{x}" y="{y}"
              text-anchor="end"
              transform="rotate(-45 {x} {y})"
              font-family="Arial"
              font-size="14">
            {escape(col_name)}
        </text>
        """

    missing_columns = [
        column for column in numeric_columns
        if column not in data
    ]

    if missing_columns:
        missing_text = "Missing features: " + ", ".join(
            missing_columns
        )

        svg += f"""
        <text x="{chart_width / 2}"
              y="{chart_height - 65}"
              text-anchor="middle"
              font-family="Arial"
              font-size="14"
              fill="#A33">
            {escape(missing_text)}
        </text>
        """

    svg += f"""
        <text x="{chart_width / 2}"
              y="{chart_height - 30}"
              text-anchor="middle"
              font-family="Arial"
              font-size="13">
            Pearson correlation | {len(records)} household records
        </text>
    </svg>
    """

    return _image(svg)

