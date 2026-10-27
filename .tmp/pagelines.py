import subprocess, sys, re, xml.etree.ElementTree as ET

PDF = 'local-textbook/sukey/raw/sukey-九上.pdf'
W, H = 541.42, 754.02

def page_lines(p):
    xml = subprocess.run(['pdftotext','-f',str(p),'-l',str(p),'-bbox-layout',PDF,'-'],
                         capture_output=True, text=True).stdout
    root = ET.fromstring(xml)
    pg = root.iter('{http://www.w3.org/1999/xhtml}page')
    out = []
    for line in root.iter('{http://www.w3.org/1999/xhtml}line'):
        words = [w.text or '' for w in line.iter('{http://www.w3.org/1999/xhtml}word')]
        text = ''.join(words)
        if not text.strip():
            continue
        x0=float(line.get('xMin')); y0=float(line.get('yMin'))
        x1=float(line.get('xMax')); y1=float(line.get('yMax'))
        out.append((text, x0/W, y0/H, (x1-x0)/W, (y1-y0)/H))
    return out

for p in [int(a) for a in sys.argv[1:]]:
    print(f'===== page {p} =====')
    for text, x, y, w, h in page_lines(p):
        print(f'x={x:.3f} y={y:.3f} w={w:.3f} h={h:.3f} | {text}')
