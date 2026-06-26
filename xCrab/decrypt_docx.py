import msoffcrypto
import tempfile
import os

def decrypt_docx(input_path, output_path, password):
    with open(input_path, 'rb') as f:
        file = msoffcrypto.OfficeFile(f)
        if file.is_encrypted():
            print(f"File is encrypted. Attempting to decrypt with password: {password}")
            file.load_key(password=password)
            with tempfile.NamedTemporaryFile(delete=False, suffix='.docx') as tmp:
                file.decrypt(tmp)
                tmp_path = tmp.name
            # Copy decrypted file to output
            with open(tmp_path, 'rb') as tmp_f:
                with open(output_path, 'wb') as out_f:
                    out_f.write(tmp_f.read())
            os.unlink(tmp_path)
            print(f"Decrypted file saved to: {output_path}")
        else:
            print("File is not encrypted")

if __name__ == "__main__":
    input_file = "搬迁事宜告知函.docx"
    output_file = "搬迁事宜告知函_decrypted.docx"
    password = "YOUR_DECRYPT_PASSWORD"
    decrypt_docx(input_file, output_file, password)