#!/bin/bash
xvfb-run --auto-servernum --server-args="-screen 0 1280x1024x24" node index.js
