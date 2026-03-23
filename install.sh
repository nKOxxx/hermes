#!/bin/bash
# ============================================================================
# ARES AGENT - Quick Installer
# Run on Mac Mini or MacBook
# ============================================================================

set -e

INSTALL_DIR="$HOME/.ares-agent"
BIN_DIR="$HOME/bin"
AGENT_SCRIPT="$INSTALL_DIR/ares-agent"

echo "⚡ ARES Agent Installer"
echo ""

# Create install directory
mkdir -p "$INSTALL_DIR"
mkdir -p "$BIN_DIR"

# Copy agent script
cp "$(dirname "$0")/ares-agent" "$AGENT_SCRIPT"
chmod +x "$AGENT_SCRIPT"

# Create symlink in ~/bin
ln -sf "$AGENT_SCRIPT" "$BIN_DIR/ares-agent"

# Add to PATH if not already there
BASHRC="$HOME/.bashrc"
ZSHRC="$HOME/.zshrc"

if ! grep -q "export PATH=.*bin" "$BASHRC" 2>/dev/null; then
    echo 'export PATH="$HOME/bin:$PATH"' >> "$BASHRC"
fi

if ! grep -q "export PATH=.*bin" "$ZSHRC" 2>/dev/null; then
    echo 'export PATH="$HOME/bin:$PATH"' >> "$ZSHRC"
fi

echo "✅ Installed to: $AGENT_SCRIPT"
echo "✅ Symlink: $BIN_DIR/ares-agent"
echo ""
echo "Run these commands to use:"
echo "  source ~/.bashrc  # or ~/.zshrc"
echo "  ares-agent help"
echo ""
echo "Or run directly:"
echo "  $AGENT_SCRIPT help"
