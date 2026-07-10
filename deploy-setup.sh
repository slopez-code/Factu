#!/bin/bash
# Sube este proyecto a tu repositorio de GitHub.
# No pide contraseñas ni claves: solo la URL de un repo que ya has creado tú mismo/a.
set -e

echo "=========================================="
echo " Factura de Intervención — subir a GitHub"
echo "=========================================="
echo
echo "Antes de continuar, crea un repositorio vacío en https://github.com/new"
echo "(sin README ni .gitignore) y copia su URL."
echo

read -p "Pega aquí la URL de tu repositorio (https://github.com/usuario/repo.git): " REPO_URL

if [ -z "$REPO_URL" ]; then
  echo "No has pegado ninguna URL. Cancelado."
  exit 1
fi

if [ ! -d .git ]; then
  echo "Este script debe ejecutarse dentro de la carpeta del proyecto (factura-pwa)."
  exit 1
fi

git remote remove origin 2>/dev/null || true
git remote add origin "$REPO_URL"
git branch -M main
git push -u origin main

echo
echo "✔ Subido correctamente."
echo
echo "Siguientes pasos (en la web de GitHub, dentro de tu repo):"
echo "  1. Settings → Secrets and variables → Actions"
echo "     → New repository secret → SUPABASE_URL"
echo "     → New repository secret → SUPABASE_ANON_KEY"
echo "  2. Settings → Pages → Source: GitHub Actions"
echo "  3. Pestaña Actions: espera a que el workflow termine (check verde)"
echo
echo "Detalle completo en QUICKSTART.md"
