import re

with open('src/data_prep.py', 'r', encoding='utf-8') as f:
    content = f.read()

# Add indentation to lines after def main():
lines = content.split('\n')
in_main = False
new_lines = []
for line in lines:
    if line.startswith('def main():'):
        in_main = True
        new_lines.append(line)
    elif in_main and line.strip() and not line.startswith('if __name__'):
        new_lines.append('    ' + line)
    else:
        new_lines.append(line)

with open('src/data_prep.py', 'w', encoding='utf-8') as f:
    f.write('\n'.join(new_lines))