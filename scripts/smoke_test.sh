#!/usr/bin/env bash
# smoke_test.sh — Prueba básica post-deploy
# Uso: BASE_URL=https://tudominio.com ./scripts/smoke_test.sh
#      TEST_USER=usuario TEST_PASS=clave ./scripts/smoke_test.sh
#
# Retorna 0 si todo OK, 1 si alguna prueba falla.

set -euo pipefail

BASE_URL="${BASE_URL:-http://localhost:8000}"
_TS=$(date +%s)
TEST_USER="${TEST_USER:-smokeuser${_TS}}"
TEST_EMAIL="${TEST_EMAIL:-smoke${_TS}@example.com}"
TEST_PASS="${TEST_PASS:-SmokePass123x}"

PASS=0
FAIL=0

_check() {
  local name="$1"
  local expected="$2"
  local actual="$3"
  if [ "$actual" = "$expected" ]; then
    echo "  ✓ $name"
    PASS=$((PASS + 1))
  else
    echo "  ✗ $name — esperado: $expected, obtenido: $actual"
    FAIL=$((FAIL + 1))
  fi
}

echo "=== Smoke Test: $BASE_URL ==="
echo ""

# 1. Healthcheck
echo "[1] Healthcheck"
STATUS=$(curl -s -o /dev/null -w "%{http_code}" "$BASE_URL/" 2>/dev/null || echo "000")
_check "GET / → 200" "200" "$STATUS"

# 2. Registro
echo "[2] Registro de usuario"
STATUS=$(curl -s -o /dev/null -w "%{http_code}" -X POST "$BASE_URL/auth/register" \
  -H "Content-Type: application/json" \
  -d "{\"username\":\"$TEST_USER\",\"email\":\"$TEST_EMAIL\",\"password\":\"$TEST_PASS\"}" 2>/dev/null || echo "000")
# 200 = ok, 400 = usuario ya existe (también aceptable en reruns)
if [ "$STATUS" = "200" ] || [ "$STATUS" = "400" ]; then
  echo "  ✓ POST /auth/register → $STATUS"
  PASS=$((PASS + 1))
else
  echo "  ✗ POST /auth/register — esperado: 200 o 400, obtenido: $STATUS"
  FAIL=$((FAIL + 1))
fi

# 3. Login (captura cookie)
echo "[3] Login"
COOKIE_JAR=$(mktemp)
STATUS=$(curl -s -o /dev/null -w "%{http_code}" -c "$COOKIE_JAR" \
  -X POST "$BASE_URL/auth/login" \
  -d "username=$TEST_USER&password=$TEST_PASS" 2>/dev/null || echo "000")
_check "POST /auth/login → 200" "200" "$STATUS"

# 4. /auth/me (usa cookie)
echo "[4] Auth/me"
STATUS=$(curl -s -o /dev/null -w "%{http_code}" -b "$COOKIE_JAR" \
  "$BASE_URL/auth/me" 2>/dev/null || echo "000")
_check "GET /auth/me → 200" "200" "$STATUS"

# 5. Listar movimientos
echo "[5] Movimientos"
STATUS=$(curl -s -o /dev/null -w "%{http_code}" -b "$COOKIE_JAR" \
  "$BASE_URL/movimientos/" 2>/dev/null || echo "000")
_check "GET /movimientos/ → 200" "200" "$STATUS"

# 6. Listar categorías (sin auth, son públicas)
echo "[6] Categorías del sistema"
STATUS=$(curl -s -o /dev/null -w "%{http_code}" \
  "$BASE_URL/categories/" 2>/dev/null || echo "000")
_check "GET /categories/ → 200" "200" "$STATUS"

# Limpieza
rm -f "$COOKIE_JAR"

echo ""
echo "=== Resultado: $PASS OK · $FAIL FAIL ==="

if [ "$FAIL" -gt 0 ]; then
  exit 1
fi
exit 0
