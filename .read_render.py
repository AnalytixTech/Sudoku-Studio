import io

path = r'C:\Users\ahmed\OneDrive\Documents\Sage\sudoku\src\components\SolverScreen.tsx'
with io.open(path, 'r', encoding='utf-8') as f:
    lines = f.readlines()

total = len(lines)
print('TOTAL_LINES=%d' % total)
print('---- RENDER REGION 160..215 ----')
for i in range(159, min(215, total)):
    print('%5d| %s' % (i + 1, lines[i].rstrip('\n')))
