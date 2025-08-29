import os
import json
from PIL import Image, ImageDraw
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


def create_hf_dataset():
    base_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    labels_path = os.path.join(base_dir, 'dataset/labeled-data/gaze-direction/labels.json')
    images_dir = os.path.join(base_dir, 'dataset/labeled-data/gaze-direction/preprocessed-images')
    output_dir = os.path.join(base_dir, 'dataset/huggingface/gaze-direction')
    output_images_dir = os.path.join(output_dir, 'images')

    os.makedirs(output_images_dir, exist_ok=True)

    with open(labels_path, 'r', encoding='utf-8') as f:
        labels_data = json.load(f)

    metadata_path = os.path.join(output_dir, 'metadata.jsonl')

    with open(metadata_path, 'w', encoding='utf-8') as meta_f:
        for image_name_key, data in tqdm(labels_data.items(), desc="Processing images"):
            image_name = data['imageName']
            image_path = os.path.join(images_dir, image_name)

            if not os.path.exists(image_path):
                print(f"Image not found, skipping: {image_path}")
                continue

            try:
                original_image = Image.open(image_path).convert("RGB")
                width, height = original_image.size
            except Exception as e:
                print(f"Error opening image {image_path}: {e}")
                continue

            for box in data['boxes']:
                if box['w'] == 0 or box['h'] == 0:
                    continue
                if not box['fields'].get('gaze_direction'):
                    continue

                img_copy = original_image.copy()
                draw = ImageDraw.Draw(img_copy)

                x1 = box['x'] * width
                y1 = box['y'] * height
                x2 = (box['x'] + box['w']) * width
                y2 = (box['y'] + box['h']) * height

                draw.rectangle([x1, y1, x2, y2], outline="red", width=3)

                sanitized_image_name = slugify(os.path.splitext(image_name)[0])
                
                output_image_filename = f"{sanitized_image_name}_{box['id']}.jpg"
                output_image_path = os.path.join(output_images_dir, output_image_filename)
                img_copy.save(output_image_path)

                metadata_entry = {
                    "file_name": os.path.join('images', output_image_filename),
                    **box['fields']
                }
                meta_f.write(json.dumps(metadata_entry, ensure_ascii=False) + '\n')

    print(f"Dataset created at: {output_dir}")
    print(f"To load the dataset, use the following Python code:")
    print(f"from datasets import load_dataset")
    print(f"dataset = load_dataset('imagefolder', data_dir='{os.path.abspath(output_dir)}')")


if __name__ == '__main__':
    create_hf_dataset()
