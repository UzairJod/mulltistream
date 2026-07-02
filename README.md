# Multistream Canvas

A browser-based Multistream Canvas application, built with HTML, CSS, and Vanilla JavaScript. 
Designed with a sleek, dark OBS Studio-style UI, this application allows you to seamlessly combine multiple browser tabs into a single viewing layout using the Screen Capture API.

## Features
* **Add Multiple Sources:** Screen share multiple windows or tabs into the canvas.
* **Crop and Scale:** Visually crop and scale any source just like in OBS Studio (`Alt + Drag Edge` to crop, `Drag Edge` to scale).
* **Layering & Opacity:** Full control over Z-Index (To Front, To Back, Forward, Backward) and transparency for each source.
* **Fullscreen Support:** View your entire composed layout without distractions.
* **Dynamic Labels:** Automatically extracts and displays window/tab titles for easy management.

## Keyboard Shortcuts
* **Alt + Drag Edge**: Crop selected source
* **Drag Inside**: Move selected source
* **Drag Edge**: Resize selected source
* **Space**: Toggle Fullscreen Mode
* **Delete**: Remove selected source
* **Ctrl + F**: Fit selected source to screen
* **Ctrl + 0**: Reset crop of selected source

## Live Demo
*https://mulltistream.vercel.app/*

## Local Usage
If you want to run this locally:
1. Clone this repository.
2. Serve the directory using any local web server. For example, using Python:
   ```bash
   python -m http.server 8000
   ```
3. Open `http://localhost:8000` in your web browser.

## Author
Created by **Uzair**
