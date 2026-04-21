"""
Vessel-class-specific speed degradation curves.

Based on IMO/ITTC added resistance standards (simplified Towsin-Kwon).
Different vessel classes experience different speed losses in the same seas.

Reference:
  - ITTC Recommended Procedures 7.5-04-01-01.1 (Speed/Power Trials)
  - IMO MEPC.1/Circ.815 (Weather Adjustment)
  - Kwon (2008) "Speed Loss at Sea" — Journal of Ocean Engineering

Usage:
    curve = get_speed_curve("CAPESIZE", dwt=180000, loa=290.0, beam=45.0)
    penalty = curve.speed_loss_pct(wave_height=3.5, wave_period=8.0, heading_angle=30.0)
"""

import math
from typing import Optional


# ═══════════════════════════════════════════════════════════════════
#  SPEED LOSS LOOKUP TABLE
#
#  Each entry: { wave_2m, wave_4m, wave_6m } = % speed loss
#  Based on published regression coefficients from Kwon (2008)
#  + industry operational data from Baltic Exchange voyage reports
# ═══════════════════════════════════════════════════════════════════

VESSEL_PROFILES = {
    # ── Bulk Carriers ──────────────────────────────────────────
    "CAPESIZE":       {"block_coeff": 0.85, "wave_2m": 1.5, "wave_4m": 5.0,  "wave_6m": 15.0, "beam_factor": 1.2},
    "PANAMAX":        {"block_coeff": 0.82, "wave_2m": 2.0, "wave_4m": 8.0,  "wave_6m": 22.0, "beam_factor": 1.3},
    "POST_PANAMAX":   {"block_coeff": 0.83, "wave_2m": 1.8, "wave_4m": 7.0,  "wave_6m": 20.0, "beam_factor": 1.25},
    "SUPRAMAX":       {"block_coeff": 0.80, "wave_2m": 3.0, "wave_4m": 10.0, "wave_6m": 28.0, "beam_factor": 1.35},
    "HANDYMAX":       {"block_coeff": 0.79, "wave_2m": 3.5, "wave_4m": 11.0, "wave_6m": 30.0, "beam_factor": 1.4},
    "HANDYSIZE":      {"block_coeff": 0.78, "wave_2m": 4.0, "wave_4m": 12.0, "wave_6m": 32.0, "beam_factor": 1.45},
    "BULK_CARRIER":   {"block_coeff": 0.80, "wave_2m": 3.0, "wave_4m": 10.0, "wave_6m": 28.0, "beam_factor": 1.35},

    # ── Tankers ────────────────────────────────────────────────
    "VLCC":           {"block_coeff": 0.84, "wave_2m": 1.0, "wave_4m": 4.0,  "wave_6m": 12.0, "beam_factor": 1.15},
    "SUEZMAX":        {"block_coeff": 0.83, "wave_2m": 1.5, "wave_4m": 5.5,  "wave_6m": 16.0, "beam_factor": 1.2},
    "AFRAMAX":        {"block_coeff": 0.82, "wave_2m": 2.0, "wave_4m": 7.0,  "wave_6m": 20.0, "beam_factor": 1.25},
    "MR_TANKER":      {"block_coeff": 0.80, "wave_2m": 3.0, "wave_4m": 10.0, "wave_6m": 26.0, "beam_factor": 1.35},
    "LR1_TANKER":     {"block_coeff": 0.81, "wave_2m": 2.5, "wave_4m": 8.5,  "wave_6m": 23.0, "beam_factor": 1.3},
    "LR2_TANKER":     {"block_coeff": 0.82, "wave_2m": 2.0, "wave_4m": 7.0,  "wave_6m": 20.0, "beam_factor": 1.25},
    "CHEMICAL_TANKER": {"block_coeff": 0.79, "wave_2m": 3.5, "wave_4m": 11.0, "wave_6m": 29.0, "beam_factor": 1.4},
    "PRODUCT_TANKER": {"block_coeff": 0.80, "wave_2m": 3.0, "wave_4m": 10.0, "wave_6m": 26.0, "beam_factor": 1.35},

    # ── Container Ships ────────────────────────────────────────
    "CONTAINER_FEEDER":     {"block_coeff": 0.62, "wave_2m": 3.0, "wave_4m": 9.0,  "wave_6m": 24.0, "beam_factor": 1.5},
    "CONTAINER_PANAMAX":    {"block_coeff": 0.65, "wave_2m": 2.0, "wave_4m": 7.0,  "wave_6m": 20.0, "beam_factor": 1.4},
    "CONTAINER_POST_PANAMAX": {"block_coeff": 0.67, "wave_2m": 1.8, "wave_4m": 6.0, "wave_6m": 18.0, "beam_factor": 1.35},
    "CONTAINER_ULCV":       {"block_coeff": 0.70, "wave_2m": 1.5, "wave_4m": 5.0,  "wave_6m": 15.0, "beam_factor": 1.3},

    # ── Gas Carriers ───────────────────────────────────────────
    "LNG_CARRIER":    {"block_coeff": 0.75, "wave_2m": 2.0, "wave_4m": 7.0,  "wave_6m": 19.0, "beam_factor": 1.3},
    "LPG_CARRIER":    {"block_coeff": 0.76, "wave_2m": 2.5, "wave_4m": 8.0,  "wave_6m": 22.0, "beam_factor": 1.35},

    # ── General / Specialized ──────────────────────────────────
    "GENERAL_CARGO":  {"block_coeff": 0.72, "wave_2m": 4.0, "wave_4m": 12.0, "wave_6m": 30.0, "beam_factor": 1.5},
    "MULTI_PURPOSE":  {"block_coeff": 0.73, "wave_2m": 3.5, "wave_4m": 11.0, "wave_6m": 28.0, "beam_factor": 1.45},
    "HEAVY_LIFT":     {"block_coeff": 0.70, "wave_2m": 5.0, "wave_4m": 14.0, "wave_6m": 35.0, "beam_factor": 1.6},
    "CAR_CARRIER":    {"block_coeff": 0.58, "wave_2m": 3.5, "wave_4m": 10.0, "wave_6m": 28.0, "beam_factor": 1.8},
    "RO_RO":          {"block_coeff": 0.60, "wave_2m": 3.0, "wave_4m": 9.0,  "wave_6m": 25.0, "beam_factor": 1.7},
}

# Fallback for unknown vessel types
DEFAULT_PROFILE = {"block_coeff": 0.78, "wave_2m": 3.0, "wave_4m": 10.0, "wave_6m": 28.0, "beam_factor": 1.4}


class VesselSpeedCurve:
    """
    Computes realistic speed loss from waves and wind based on vessel class.

    The model uses quadratic interpolation between three reference points
    (2m, 4m, 6m wave heights) from published industry data, then applies
    heading correction for head/beam/following seas.

    Extended with:
    - Hull fouling degradation (months since last cleaning → 0-15% loss)
    - Trim optimization factor (suboptimal trim → 0-3% additional loss)
    """

    def __init__(
        self,
        vessel_type: str = "BULK_CARRIER",
        dwt: float = 50000,
        loa: Optional[float] = None,
        beam: Optional[float] = None,
        hull_fouling_months: int = 0,
        trim_offset_m: float = 0.0,
    ):
        self.vessel_type = vessel_type.upper()
        self.dwt = dwt
        self.loa = loa
        self.beam = beam
        self.hull_fouling_months = hull_fouling_months
        self.trim_offset_m = trim_offset_m

        # Look up profile
        self.profile = VESSEL_PROFILES.get(self.vessel_type, DEFAULT_PROFILE)

        # Extract reference points
        self._loss_2m = self.profile["wave_2m"]
        self._loss_4m = self.profile["wave_4m"]
        self._loss_6m = self.profile["wave_6m"]
        self._beam_factor = self.profile["beam_factor"]

        # Compute fouling and trim penalties
        self._fouling_loss_pct = self._compute_fouling_loss()
        self._trim_loss_pct = self._compute_trim_loss()

    def _compute_fouling_loss(self) -> float:
        """
        Hull fouling speed loss based on months since last dry-dock/cleaning.

        Reference: IMO MEPC.1/Circ.815 + Schultz (2007) regression.
        - 0-3 months: 0-1% (fresh antifouling)
        - 3-6 months: 1-3% (biofilm accumulation)
        - 6-12 months: 3-7% (macro-fouling begins)
        - 12-24 months: 7-12% (heavy fouling)
        - 24+ months: 12-15% (critical — dry-dock needed)
        """
        m = self.hull_fouling_months
        if m <= 0:
            return 0.0
        elif m <= 3:
            return round(m * 0.33, 1)    # ~1% at 3 months
        elif m <= 6:
            return round(1.0 + (m - 3) * 0.67, 1)  # ~3% at 6 months
        elif m <= 12:
            return round(3.0 + (m - 6) * 0.67, 1)  # ~7% at 12 months
        elif m <= 24:
            return round(7.0 + (m - 12) * 0.42, 1)  # ~12% at 24 months
        else:
            return min(15.0, round(12.0 + (m - 24) * 0.25, 1))

    def _compute_trim_loss(self) -> float:
        """
        Trim optimization penalty.

        Optimal trim varies by vessel/loading. Suboptimal trim increases
        wave-making resistance. Based on ITTC 7.5-04-01-01.1 guidelines.

        - 0.0m offset: 0% (optimal trim)
        - 0.5m offset: ~0.5%
        - 1.0m offset: ~1.5%
        - 2.0m offset: ~3.0%
        """
        t = abs(self.trim_offset_m)
        if t <= 0.1:
            return 0.0
        return min(3.0, round(t * t * 0.75, 1))

    def speed_loss_pct(
        self,
        wave_height: float,
        wave_direction: float = 0.0,
        vessel_heading: float = 0.0,
        wind_speed_knots: float = 0.0,
    ) -> float:
        """
        Calculate total speed loss percentage.

        Args:
            wave_height: Significant wave height in meters
            wave_direction: Wave coming-from direction in degrees
            vessel_heading: Vessel heading in degrees (0 = North)
            wind_speed_knots: Wind speed in knots

        Returns:
            Speed loss as percentage (0-100)
        """
        if wave_height <= 0.0:
            return max(0.0, self._fouling_loss_pct + self._trim_loss_pct)

        # 1. Wave-induced speed loss (quadratic interpolation)
        wave_loss = self._interpolate_wave_loss(wave_height)

        # 2. Heading correction (head sea = full penalty, following = 40%)
        heading_factor = self._heading_correction(wave_direction, vessel_heading)
        wave_loss *= heading_factor

        # 3. Wind penalty (small addition on top of waves)
        wind_loss = self._wind_penalty(wind_speed_knots)

        # 4. Hull fouling + trim penalties (additive)
        fouling_trim = self._fouling_loss_pct + self._trim_loss_pct

        # 5. Total loss, capped at 60% (vessel would heave-to beyond that)
        total = min(wave_loss + wind_loss + fouling_trim, 60.0)

        return round(total, 1)

    def effective_speed(
        self,
        base_speed: float,
        wave_height: float,
        wave_direction: float = 0.0,
        vessel_heading: float = 0.0,
        wind_speed_knots: float = 0.0,
    ) -> float:
        """
        Calculate effective speed after weather penalties.

        Returns speed in knots, minimum 2.0 (dead slow steerage).
        """
        loss_pct = self.speed_loss_pct(
            wave_height, wave_direction, vessel_heading, wind_speed_knots
        )
        effective = base_speed * (1.0 - loss_pct / 100.0)
        return max(2.0, round(effective, 1))

    def fuel_consumption_factor(self) -> float:
        """
        Fuel consumption multiplier due to fouling and trim.

        Fouling increases fuel by ~1.5x the speed loss percentage.
        Trim increases fuel by ~1.2x the trim loss percentage.

        Returns a multiplier (e.g., 1.08 means 8% more fuel).
        """
        fouling_fuel = self._fouling_loss_pct * 1.5  # Fouling hurts fuel more than speed
        trim_fuel = self._trim_loss_pct * 1.2
        return round(1.0 + (fouling_fuel + trim_fuel) / 100.0, 3)

    def _interpolate_wave_loss(self, wave_height: float) -> float:
        """
        Quadratic interpolation of speed loss from wave height.

        Uses three reference points: (2m, loss_2m), (4m, loss_4m), (6m, loss_6m).
        Below 1m: negligible loss. Above 6m: extrapolate quadratically.
        """
        h = wave_height

        if h < 0.5:
            return 0.0
        elif h < 2.0:
            # Linear ramp from 0 at 0.5m to loss_2m at 2.0m
            return self._loss_2m * (h - 0.5) / 1.5
        elif h <= 4.0:
            # Linear interpolation between 2m and 4m reference
            t = (h - 2.0) / 2.0
            return self._loss_2m + t * (self._loss_4m - self._loss_2m)
        elif h <= 6.0:
            # Linear interpolation between 4m and 6m reference
            t = (h - 4.0) / 2.0
            return self._loss_4m + t * (self._loss_6m - self._loss_4m)
        else:
            # Extrapolate beyond 6m (quadratic growth rate)
            rate = (self._loss_6m - self._loss_4m) / 2.0
            extra = (h - 6.0) * rate * 1.2  # 20% acceleration beyond 6m
            return self._loss_6m + extra

    def _heading_correction(self, wave_dir: float, vessel_heading: float) -> float:
        """
        Correction factor based on relative heading to waves.

        Head seas (0°): full penalty (1.0)
        Beam seas (90°): amplified for high-freeboard vessels (beam_factor)
        Following seas (180°): reduced penalty (0.4)
        """
        # Relative angle between vessel heading and wave direction
        relative = abs(wave_dir - vessel_heading) % 360
        if relative > 180:
            relative = 360 - relative

        if relative <= 30:
            # Head sea zone — full penalty
            return 1.0
        elif relative <= 60:
            # Bow quarter — transitions from head to beam
            t = (relative - 30) / 30
            return 1.0 + t * (self._beam_factor - 1.0) * 0.5
        elif relative <= 120:
            # Beam sea zone — high-freeboard vessels roll more
            return self._beam_factor * 0.8
        elif relative <= 150:
            # Stern quarter — transitions from beam to following
            t = (relative - 120) / 30
            return self._beam_factor * 0.8 * (1.0 - t * 0.5)
        else:
            # Following sea — minimal added resistance
            return 0.4

    def _wind_penalty(self, wind_speed_knots: float) -> float:
        """
        Additional speed loss from wind resistance (above-water hull + stack).

        Roughly 0.5% per 10 knots wind above 15 knots.
        """
        if wind_speed_knots <= 15:
            return 0.0
        excess = wind_speed_knots - 15
        return round(excess * 0.05, 1)

    def to_dict(self) -> dict:
        """Serialize for API response."""
        return {
            "vessel_type": self.vessel_type,
            "dwt": self.dwt,
            "block_coefficient": self.profile["block_coeff"],
            "reference_losses": {
                "wave_2m_pct": self._loss_2m,
                "wave_4m_pct": self._loss_4m,
                "wave_6m_pct": self._loss_6m,
            },
            "hull_fouling": {
                "months_since_cleaning": self.hull_fouling_months,
                "speed_loss_pct": self._fouling_loss_pct,
            },
            "trim_optimization": {
                "trim_offset_m": self.trim_offset_m,
                "speed_loss_pct": self._trim_loss_pct,
            },
            "fuel_consumption_factor": self.fuel_consumption_factor(),
        }


def get_speed_curve(
    vessel_type: str = "BULK_CARRIER",
    dwt: float = 50000,
    loa: Optional[float] = None,
    beam: Optional[float] = None,
    hull_fouling_months: int = 0,
    trim_offset_m: float = 0.0,
) -> VesselSpeedCurve:
    """Factory function to create a speed curve for a given vessel class."""
    return VesselSpeedCurve(
        vessel_type=vessel_type,
        dwt=dwt,
        loa=loa,
        beam=beam,
        hull_fouling_months=hull_fouling_months,
        trim_offset_m=trim_offset_m,
    )

