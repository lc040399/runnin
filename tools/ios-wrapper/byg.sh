#!/bin/bash
# Byg + installér Runnin som native app i iOS-simulatoren (WKWebView-wrapper om runnin.pages.dev)
set -e
cd "$(dirname "$0")"
mkdir -p Runnin.app && cp Info.plist Runnin.app/
python3 -c "from PIL import Image; Image.open('../../assets/mark.png').resize((120,120), Image.LANCZOS).convert('RGB').save('Runnin.app/AppIcon60x60@2x.png')"
xcrun -sdk iphonesimulator swiftc -parse-as-library -target arm64-apple-ios16.0-simulator -o Runnin.app/Runnin main.swift
xcrun simctl install booted Runnin.app
xcrun simctl launch booted dk.runnin.app
