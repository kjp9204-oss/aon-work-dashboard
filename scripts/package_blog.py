"""Rebuild the blog download package without machine-specific paths."""
from pathlib import Path
from zipfile import ZipFile, ZIP_DEFLATED

ROOT = Path(__file__).resolve().parents[1]
MEMBERS = (
    'deliverables/AON_짧게_시작하는_운동_검토본.docx',
    'content/article-copy.txt',
    'content/evidence.md',
    'content/review.md',
    'assets/cover.png',
    'assets/activity-guide.png',
    'README.md',
)
OUTPUT = ROOT / 'deliverables/AON_블로그_발행전_예시묶음.zip'

for member in MEMBERS:
    if not (ROOT / member).is_file():
        raise FileNotFoundError(member)

with ZipFile(OUTPUT, 'w', ZIP_DEFLATED) as archive:
    for member in MEMBERS:
        archive.write(ROOT / member, member)

with ZipFile(OUTPUT) as archive:
    assert archive.testzip() is None
print('Blog ZIP created; members:', len(MEMBERS))
