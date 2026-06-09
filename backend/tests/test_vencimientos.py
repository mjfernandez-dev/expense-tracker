"""
Tests unitarios para la lógica de vencimientos de gastos fijos.
Cubre effective_day() y should_notify() del módulo vencimiento_service.
"""
import sys
import os
from datetime import date

# Asegurar que el backend esté en el path de Python
sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from services.scheduler_service import effective_day, should_notify


# ============================================================
# effective_day()
# ============================================================

class TestEffectiveDay:
    def test_feb_no_bisiesto_dia_30(self):
        """30 en febrero de año no bisiesto → 28"""
        assert effective_day(30, 2025, 2) == 28

    def test_feb_bisiesto_dia_30(self):
        """30 en febrero de año bisiesto → 29"""
        assert effective_day(30, 2024, 2) == 29

    def test_feb_no_bisiesto_dia_31(self):
        """31 en febrero de año no bisiesto → 28"""
        assert effective_day(31, 2025, 2) == 28

    def test_feb_bisiesto_dia_31(self):
        """31 en febrero de año bisiesto → 29"""
        assert effective_day(31, 2024, 2) == 29

    def test_abril_dia_31(self):
        """31 en abril (30 días) → 30"""
        assert effective_day(31, 2025, 4) == 30

    def test_dia_dentro_del_mes(self):
        """Día dentro del rango del mes → sin cambio"""
        assert effective_day(15, 2025, 6) == 15

    def test_dia_15_cualquier_mes(self):
        """día 15 siempre se devuelve tal cual"""
        for month in range(1, 13):
            assert effective_day(15, 2025, month) == 15

    def test_dia_31_enero(self):
        """31 en enero (tiene 31 días) → 31"""
        assert effective_day(31, 2025, 1) == 31

    def test_dia_31_diciembre(self):
        """31 en diciembre (tiene 31 días) → 31"""
        assert effective_day(31, 2025, 12) == 31


# ============================================================
# should_notify()
# ============================================================

class TestShouldNotify:
    def test_fires_dos_dias_antes(self):
        """dia=10, anticipacion=2, today=8 → True"""
        assert should_notify(10, 2, date(2025, 6, 8)) is True

    def test_fires_en_dia_vencimiento_con_anticipacion_cero(self):
        """dia=10, anticipacion=0, today=10 → True"""
        assert should_notify(10, 0, date(2025, 6, 10)) is True

    def test_no_fires_dia_incorrecto(self):
        """dia=10, anticipacion=2, today=7 → False (un día antes de lo que corresponde)"""
        assert should_notify(10, 2, date(2025, 6, 7)) is False

    def test_no_fires_dia_posterior(self):
        """dia=10, anticipacion=2, today=9 → False (un día después)"""
        assert should_notify(10, 2, date(2025, 6, 9)) is False

    def test_dia_none_siempre_false(self):
        """dia=None → False siempre, independientemente de anticipacion"""
        assert should_notify(None, 2, date(2025, 6, 8)) is False
        assert should_notify(None, 0, date(2025, 1, 1)) is False

    def test_vencimiento_pasado_este_mes_no_fires_hoy(self):
        """dia=5, anticipacion=2, today=10 → False (5 ya pasó este mes)"""
        assert should_notify(5, 2, date(2025, 6, 10)) is False

    def test_vencimiento_pasado_este_mes_fires_proximo_mes(self):
        """dia=5, anticipacion=2, today=3/Jul → True (5/Jul - 2 = 3/Jul)"""
        assert should_notify(5, 2, date(2025, 7, 3)) is True

    def test_vencimiento_pasado_en_diciembre_proyecta_enero(self):
        """dia=5, anticipacion=2, today=10/Dic → False; 3/Ene/2026 → True"""
        assert should_notify(5, 2, date(2025, 12, 10)) is False
        assert should_notify(5, 2, date(2026, 1, 3)) is True

    def test_feb_no_bisiesto_dia_31(self):
        """dia=31 en Feb no bisiesto: effective=28, con anticipacion=2 → fires 26/Feb"""
        assert should_notify(31, 2, date(2025, 2, 26)) is True
        assert should_notify(31, 2, date(2025, 2, 27)) is False

    def test_feb_bisiesto_dia_31(self):
        """dia=31 en Feb bisiesto: effective=29, con anticipacion=2 → fires 27/Feb"""
        assert should_notify(31, 2, date(2024, 2, 27)) is True
        assert should_notify(31, 2, date(2024, 2, 28)) is False

    def test_anticipacion_cero_fires_on_due(self):
        """anticipacion=0 → notifica exactamente el día de vencimiento"""
        assert should_notify(15, 0, date(2025, 3, 15)) is True
        assert should_notify(15, 0, date(2025, 3, 14)) is False
        assert should_notify(15, 0, date(2025, 3, 16)) is False
