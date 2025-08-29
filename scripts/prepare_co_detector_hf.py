import os
import json
import shutil
from tqdm import tqdm
import unicodedata
import re

def slugify(value, allow_unicode=False):
    """
    Taken from https://github.com/django/django/blob/master/django/utils/text.py
    Convert to ASCII if 'allow_unicode' is False. Convert spaces or repeated
    dashes to single dashes. Remove characters that aren't alphanumerics,
    underscores, or hyphens. Convert to lowercase. Also strip leading and
    trailing whitespace, dashes, and underscores.
    """
    value = str(value)
    if allow_unicode:
        value = unicodedata.normalize('NFKC', value)
    else:
        value = unicodedata.normalize('NFKD', value).encode('ascii', 'ignore').decode('ascii')
    value = re.sub(r'[^\w\s-]', '', value.lower())
    return re.sub(r'[-\s]+', '-', value).strip('-_')

def create_co_detector_hf_dataset():
    base_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    labels_path = os.path.join(base_dir, 'dataset/labeled-data/co-detector/labels.json')
    images_dir = os.path.join(base_dir, 'dataset/labeled-data/co-detector/processed-images')
    output_dir = os.path.join(base_dir, 'dataset/huggingface/co-detector')
    output_images_dir = os.path.join(output_dir, 'images')

    os.makedirs(output_images_dir, exist_ok=True)

    with open(labels_path, 'r', encoding='utf-8') as f:
        labels_data = json.load(f)

    metadata_path = os.path.join(output_dir, 'metadata.jsonl')

    with open(metadata_path, 'w', encoding='utf-8') as meta_f:
        for image_name_key, data in tqdm(labels_data.items(), desc="Processing co-detector images"):
            image_name = data['imageName']
            source_image_path = os.path.join(images_dir, image_name)

            if not os.path.exists(source_image_path):
                print(f"Image not found, skipping: {source_image_path}")
                continue

            # Since we are not drawing on the image, we can just copy it.
            sanitized_image_name = slugify(os.path.splitext(image_name)[0]) + os.path.splitext(image_name)[1]
            dest_image_path = os.path.join(output_images_dir, sanitized_image_name)
            shutil.copy(source_image_path, dest_image_path)

            # There's only one "box" which holds the image-level label
            fields = data['boxes'][0]['fields']
            
            metadata_entry = {
                "file_name": os.path.join('images', sanitized_image_name),
                **fields
            }
            meta_f.write(json.dumps(metadata_entry, ensure_ascii=False) + '\n')

    print(f"Dataset created at: {output_dir}")
    print(f"To load the dataset, use the following Python code:")
    print(f"from datasets import load_dataset")
    print(f"dataset = load_dataset('imagefolder', data_dir='{os.path.abspath(output_dir)}')")


if __name__ == '__main__':
    create_co_detector_hf_dataset()
