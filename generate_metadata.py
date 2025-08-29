#!/usr/bin/env python3
"""
Generate metadata.jsonl for co-detector-eazy dataset
"""

import json
import os
from pathlib import Path

def generate_metadata():
    # Path to the co-detector-eazy dataset
    dataset_path = Path("dataset/huggingface/co-detector-eazy")
    images_path = dataset_path / "images"
    metadata_path = dataset_path / "metadata.jsonl"
    
    # Get all image files in the images directory
    image_files = []
    for file_path in images_path.iterdir():
        if file_path.is_file() and file_path.suffix.lower() in ['.jpg', '.jpeg', '.png', '.gif', '.bmp']:
            image_files.append(file_path.name)
    
    # Sort the files for consistent ordering
    image_files.sort()
    
    # Generate metadata entries
    metadata_entries = []
    for image_file in image_files:
        entry = {
            "file_name": f"images/{image_file}",
            "has-co-detector": True
        }
        metadata_entries.append(entry)
    
    # Write to metadata.jsonl
    with open(metadata_path, 'w', encoding='utf-8') as f:
        for entry in metadata_entries:
            f.write(json.dumps(entry, ensure_ascii=False) + '\n')
    
    print(f"Generated metadata.jsonl with {len(metadata_entries)} entries")
    for entry in metadata_entries:
        print(f"  {entry['file_name']}")

if __name__ == "__main__":
    generate_metadata()