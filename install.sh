#!/bin/bash

# KindleCards Obsidian Plugin Installation Script
# This script helps install the KindleCards plugin for development

echo "🔖 KindleCards Plugin Installer"
echo "================================"

# Check if we're in an Obsidian vault
if [ ! -d ".obsidian" ]; then
    echo "❌ Error: This doesn't appear to be an Obsidian vault directory."
    echo "Please run this script from your vault's root directory."
    exit 1
fi

# Create plugins directory if it doesn't exist
if [ ! -d ".obsidian/plugins" ]; then
    echo "📁 Creating plugins directory..."
    mkdir -p .obsidian/plugins
fi

# Check if plugin directory already exists
if [ -d ".obsidian/plugins/kindle-cards" ]; then
    echo "⚠️  Plugin directory already exists. Remove it? (y/n)"
    read -r response
    if [[ "$response" =~ ^([yY][eE][sS]|[yY])$ ]]; then
        rm -rf .obsidian/plugins/kindle-cards
        echo "🗑️  Removed existing plugin directory"
    else
        echo "❌ Installation cancelled"
        exit 1
    fi
fi

# Copy plugin files
echo "📋 Copying plugin files..."
cp -r . .obsidian/plugins/kindle-cards/

# Remove unnecessary files from plugin directory
echo "🧹 Cleaning up plugin directory..."
cd .obsidian/plugins/kindle-cards/
rm -f install.sh
rm -f DEVELOPMENT.md
rm -f sample-My_Clippings.txt
rm -rf .git/
rm -f .gitignore

# Install dependencies and build
echo "📦 Installing dependencies..."
if command -v npm &> /dev/null; then
    npm install
    echo "🔨 Building plugin..."
    npm run build

    # Clean up development files
    rm -rf node_modules/
    rm -f package-lock.json
    rm -f tsconfig.json
    rm -f esbuild.config.mjs
    rm -f version-bump.mjs
    rm -f *.ts

    echo "✅ Installation complete!"
    echo ""
    echo "Next steps:"
    echo "1. Restart Obsidian"
    echo "2. Go to Settings → Community Plugins"
    echo "3. Enable 'KindleCards'"
    echo "4. Configure your Kindle path in the plugin settings"
    echo ""
    echo "Enjoy creating flashcards from your Kindle highlights! 📚"
else
    echo "❌ npm not found. Please install Node.js and npm first."
    echo "You can download it from: https://nodejs.org/"
    exit 1
fi
