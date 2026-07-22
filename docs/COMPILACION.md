# Mini-manual: cómo compilar una nueva versión de POSPAN para Windows

POSPAN no se compila en esta Mac. El build de Windows lo hace GitHub Actions
(un runner `windows-latest` en la nube) cada vez que se sube código a la rama
`main`. El procedimiento es: probar en local → subir a `main` → esperar el
build → descargar el instalador.

## Requisitos previos (ya configurados en este equipo)

- `git` con acceso de push al repo (`origin` → GitHub).
- `gh` (GitHub CLI) autenticado (`gh auth status` para confirmar).
- Workflow ya existente: `.github/workflows/build-windows.yml`.

## 1. Probar los cambios en local antes de subir

```bash
npx tsc --noEmit        # revisa tipos de TypeScript, debe salir sin nada
npm run tauri dev       # levanta la app en modo desarrollo para probar a mano
```

Si tocaste `src-tauri/src/lib.rs` (Rust), agrega también:

```bash
cd src-tauri && cargo check --no-default-features && cd ..
```

No subas nada a `main` sin haber probado el flujo afectado en la app corriendo
localmente (venta, corte, impresión, lo que hayas tocado).

## 2. Commitear y subir a `main`

```bash
git status                       # revisa qué se va a subir
git add <archivos modificados>   # evita "git add -A" a ciegas
git commit -m "Descripción del cambio"
git push origin main
```

El push a `main` dispara automáticamente el workflow de GitHub Actions.

## 3. Ver el build en progreso

```bash
gh run list --limit 3            # el más reciente debe decir "in_progress"
gh run watch <run-id> --exit-status   # se queda esperando hasta que termine
```

Tarda entre 7 y 9 minutos normalmente. Si `gh run watch` termina con éxito
(exit code 0), el build compiló bien. Si falla, revisa el error con:

```bash
gh run view <run-id> --log-failed
```

## 4. Descargar los instaladores

```bash
rm -rf windows_installer
mkdir -p windows_installer
gh run download <run-id> -D windows_installer
```

Quedan dos archivos (ambos instalan lo mismo, formatos distintos):

- `windows_installer/pospan-windows-installers/nsis/POSPAN_x64-setup.exe` ← el que normalmente se usa
- `windows_installer/pospan-windows-installers/msi/POSPAN_x64_en-US.msi`

`windows_installer/` está en `.gitignore` (pesa cientos de MB), no se sube al repo.

## 5. Instalar en la máquina de la panadería

El instalador **actualiza sobre la instalación existente y no borra la base
de datos** (vive aparte, en `%APPDATA%\com.simonsanchez.pospan\pospan.db`,
fuera de la carpeta del programa). Aun así, antes de instalar una versión
nueva en la máquina real:

1. Abre POSPAN → Configuración → "Respaldar Base de Datos Ahora" → guarda la
   copia en un USB o carpeta aparte (por si algo sale mal).
2. Corre el instalador nuevo normal, como cualquier instalador de Windows.
3. Abre la app y confirma que tus productos, ventas e inventario siguen ahí.

## Notas

- No hace falta tocar manualmente el archivo `.db` para que tenga la
  estructura de tablas más reciente: la app la actualiza sola (de forma
  segura, sin borrar datos) cada vez que arranca.
- Solo compila cuando el cambio ya se probó en local. Cada build sube un
  instalador nuevo a las Actions de GitHub, no hay "deshacer" fácil una vez
  que alguien lo instaló — por eso el respaldo del paso 5 antes de instalar
  en la máquina real.
