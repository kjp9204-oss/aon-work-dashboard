"""Validate portable links and packaged artifacts using Python's standard library."""
from html.parser import HTMLParser
from pathlib import Path
from urllib.parse import unquote, urlsplit
from zipfile import ZipFile, BadZipFile
import json
import sys
import xml.etree.ElementTree as ET

ROOT = Path(__file__).resolve().parents[1]


class LocalLinks(HTMLParser):
    def __init__(self):
        super().__init__()
        self.links = []

    def handle_starttag(self, tag, attrs):
        for name, value in attrs:
            if name not in ("src", "href") or not value:
                continue
            parsed = urlsplit(value)
            if parsed.scheme or parsed.netloc or not parsed.path:
                continue
            self.links.append(unquote(parsed.path))


errors = []
link_count = 0
for html in sorted(ROOT.glob("*.html")):
    parser = LocalLinks()
    parser.feed(html.read_text(encoding="utf-8"))
    for link in parser.links:
        link_count += 1
        target = (html.parent / link).resolve()
        if not target.is_relative_to(ROOT):
            errors.append(f"Outside repository: {html.name}: {link}")
        elif not target.is_file():
            errors.append(f"Missing file: {html.name}: {link}")

archives = sorted((ROOT / "deliverables").glob("*.zip"))
documents = sorted((ROOT / "deliverables").glob("*.docx"))
for artifact in archives + documents:
    try:
        with ZipFile(artifact) as archive:
            bad = archive.testzip()
            if bad:
                errors.append(f"Archive CRC failure: {artifact.name}: {bad}")
            for name in archive.namelist():
                normalized = name.replace("\\", "/")
                if normalized.startswith("/") or ".." in normalized.split("/"):
                    errors.append(f"Unsafe archive member: {artifact.name}: {name}")
            if artifact.suffix == ".docx":
                ET.fromstring(archive.read("word/document.xml"))
    except (BadZipFile, KeyError, ET.ParseError) as exc:
        errors.append(f"Invalid artifact: {artifact.name}: {exc}")

if not archives or not documents:
    errors.append("Expected Word and ZIP deliverables were not found")

print(json.dumps({"passed": not errors, "html_files": len(list(ROOT.glob('*.html'))),
                  "local_links": link_count, "zip_files": len(archives),
                  "word_files": len(documents), "errors": errors}, ensure_ascii=False))
sys.exit(1 if errors else 0)
