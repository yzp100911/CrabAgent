import sys
from docx import Document

def read_docx(file_path):
    doc = Document(file_path)
    full_text = []
    for para in doc.paragraphs:
        if para.text.strip():
            full_text.append(para.text)
    return '\n'.join(full_text)

if __name__ == "__main__":
    if len(sys.argv) < 2:
        print("Usage: python read_docx.py <file_path>")
        sys.exit(1)
    file_path = sys.argv[1]
    try:
        text = read_docx(file_path)
        print(text)
    except Exception as e:
        print(f"Error: {e}")
        sys.exit(1)