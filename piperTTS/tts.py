import subprocess
import os
import sys
import wave

# --------- PATH SETTINGS --------- #
PIPER_PATH = "piper/piper.exe"
MODEL_PATH = "models/en_US-amy-medium.onnx"
OUTPUT_FILE = "output.wav"
INPUT_FILE = "input.txt"
# ---------------------------------- #

def read_text(file_path):
    if not os.path.exists(file_path):
        print("Input file not found.")
        sys.exit(1)

    with open(file_path, "r", encoding="utf-8") as f:
        text = f.read().strip()

    if not text:
        print("Input text is empty.")
        sys.exit(1)

    return text


def chunk_text(text, max_length=400):
    words = text.split()
    chunks = []
    current = []

    for word in words:
        current.append(word)
        if len(" ".join(current)) > max_length:
            chunks.append(" ".join(current))
            current = []

    if current:
        chunks.append(" ".join(current))

    return chunks


def generate_audio(chunks):
    temp_files = []

    for i, chunk in enumerate(chunks):
        temp_output = f"temp_{i}.wav"
        temp_files.append(temp_output)

        command = [
            PIPER_PATH,
            "--model", MODEL_PATH,
            "--output_file", temp_output,
            "--length_scale", "1.0",
            "--noise_scale", "0.667",
            "--noise_w", "0.8"
        ]

        process = subprocess.Popen(
            command,
            stdin=subprocess.PIPE,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            text=True
        )

        process.communicate(chunk)

        if process.returncode != 0:
            print("Error generating speech")
            sys.exit(1)

    return temp_files


def merge_audio(files, final_output):
    data = []

    for file in files:
        w = wave.open(file, 'rb')
        data.append([w.getparams(), w.readframes(w.getnframes())])
        w.close()

    output = wave.open(final_output, 'wb')
    output.setparams(data[0][0])

    for params, frames in data:
        output.writeframes(frames)

    output.close()

    for f in files:
        os.remove(f)


def main():
    print("Reading input text...")
    text = read_text(INPUT_FILE)

    print("Splitting into safe chunks...")
    chunks = chunk_text(text)

    print("Generating speech using en_US-amy-medium...")
    temp_files = generate_audio(chunks)

    print("Merging audio...")
    merge_audio(temp_files, OUTPUT_FILE)

    print("Done! Audio saved as output.wav")


if __name__ == "__main__":
    main()