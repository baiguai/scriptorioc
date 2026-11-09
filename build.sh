#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
DEPS_DIR="$SCRIPT_DIR/deps"
IMGUI_DIR="$DEPS_DIR/imgui"
BIN_DIR="$SCRIPT_DIR/bin/linux"
EXE="scriptorioc"

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

# -----------------------------
# Build configuration
# -----------------------------
BUILD_TYPE="debug"

if [[ "${1:-}" == "r" ]]; then
    BUILD_TYPE="release"
fi

echo -e "${YELLOW}==> Build type: $BUILD_TYPE${NC}"

echo -e "${YELLOW}==> Checking dependencies...${NC}"

if ! pkg-config --exists glfw3 2>/dev/null; then
    echo -e "${RED}glfw3 not found. Install it with:${NC}"
    echo "  sudo apt install libglfw3-dev"
    echo ""
    read -rp "Install libglfw3-dev now? [y/N] " answer
    if [[ "$answer" =~ ^[Yy]$ ]]; then
        sudo apt install -y libglfw3-dev
    else
        echo "Aborting."
        exit 1
    fi
fi

if [[ ! -f "$IMGUI_DIR/imgui.h" ]]; then
    echo -e "${YELLOW}==> Fetching imgui (docking branch)...${NC}"
    mkdir -p "$DEPS_DIR"
    git clone --depth 1 --branch docking https://github.com/ocornut/imgui.git "$IMGUI_DIR"
else
    echo -e "${GREEN}==> imgui source found at $IMGUI_DIR${NC}"
fi

# -----------------------------
# ImGui patches
# -----------------------------
IMGUI_PATCH="$SCRIPT_DIR/patches/imgui-no-escape-revert.patch"

apply_imgui_patch() {
    if grep -q "ImGuiInputTextFlags_NoEscapeRevert" "$IMGUI_DIR/imgui.h" &&
       grep -q "ImGuiInputTextFlags_NoEscapeRevert" "$IMGUI_DIR/imgui_widgets.cpp"; then
        echo -e "${GREEN}==> ImGui Escape-revert patch already applied${NC}"
        return 0
    fi

    if [[ ! -f "$IMGUI_PATCH" ]]; then
        echo -e "${RED}==> Missing patch file: $IMGUI_PATCH${NC}"
        return 1
    fi

    echo -e "${YELLOW}==> Applying ImGui Escape-revert patch...${NC}"

    if (cd "$SCRIPT_DIR" && git apply --check "$IMGUI_PATCH") 2>/dev/null; then
        (cd "$SCRIPT_DIR" && git apply "$IMGUI_PATCH")
    elif (cd "$SCRIPT_DIR" && patch -p1 --forward < "$IMGUI_PATCH"); then
        :
    else
        echo -e "${RED}==> Failed to apply $IMGUI_PATCH${NC}"
        echo -e "${RED}==> ImGui may have changed; update the patch in patches/ manually.${NC}"
        return 1
    fi

    if ! grep -q "ImGuiInputTextFlags_NoEscapeRevert" "$IMGUI_DIR/imgui.h" ||
       ! grep -q "ImGuiInputTextFlags_NoEscapeRevert" "$IMGUI_DIR/imgui_widgets.cpp"; then
        echo -e "${RED}==> Patch applied but expected changes are missing.${NC}"
        return 1
    fi

    echo -e "${GREEN}==> ImGui Escape-revert patch applied${NC}"
}

if ! apply_imgui_patch; then
    echo -e "${RED}==> Aborting: could not apply required ImGui patch.${NC}"
    exit 1
fi

echo -e "${YELLOW}==> Building...${NC}"
mkdir -p "$BIN_DIR"

FULL_EXE="$BIN_DIR/$EXE"

make -C "$SCRIPT_DIR" \
    IMGUI_DIR="$IMGUI_DIR" \
    EXE="$FULL_EXE" \
    CONFIG="$BUILD_TYPE" \
    clean 2>/dev/null || true

make -C "$SCRIPT_DIR" \
    IMGUI_DIR="$IMGUI_DIR" \
    EXE="$FULL_EXE" \
    CONFIG="$BUILD_TYPE" \
    -j"$(nproc)"

echo -e "${YELLOW}==> Copying translations...${NC}"
rm -rf "$BIN_DIR/translations"
rsync -a --exclude='*.py' "$SCRIPT_DIR/translations/done/" "$BIN_DIR/translations/"

echo -e "${YELLOW}==> Copying help file...${NC}"
cp "$SCRIPT_DIR/scriptorioc_help.html" "$BIN_DIR/"

echo -e "${GREEN}==> Build complete: $FULL_EXE${NC}"
