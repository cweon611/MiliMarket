from pathlib import Path
import win32com.client
import json

root = Path(__file__).resolve().parent
source = root.parent.parent / '군 급식 조달을 위한 식품 검색 및 발주 의사결정 지원 시스템 설계_최종.hwp'
output = root / '군 급식 조달을 위한 식품 검색 및 발주 의사결정 지원 시스템 설계_최종_저자표시수정.hwp'
replacements = [
    ('나건우¹, 천서원¹, 황영민¹, 유재명², 김동연³, 유현진³, 황윤하³',
     '천서원¹*, 나건우¹, 황영민¹, 김동연³, 유현진³, 황윤하³, 유재명²†'),
    ('¹전남대학교 인공지능학부, ²전남대학교, ³상무대 제51군수지원단',
     '¹전남대학교 인공지능학부, ²전남대학교, ³상무대 제51군수지원단\r* 제1저자: 천서원 · † 교신저자: 유재명 · 그 외 참여저자'),
    ('nageon34@gmail.com, cweon611@jnu.ac.kr', 'cweon611@jnu.ac.kr, nageon34@gmail.com'),
    ('Geon-u Na¹, Seowon Cheon¹', 'Seowon Cheon¹*, Geon-u Na¹'),
    ('Jae-Myeong Yoo²,', ''),
    ('Yun-ha Hwang³', 'Yun-ha Hwang³, Jae-Myeong Yoo²†'),
    ('³51st Logistics Support Group, Sangmudae',
     '³51st Logistics Support Group, Sangmudae\r* First author · † Corresponding author · Other authors: co-authors'),
]
h = win32com.client.dynamic.Dispatch('HWPFrame.HwpObject')
h.XHwpWindows.Item(0).Visible = True
assert h.Open(str(source), 'HWP', '')
before = h.GetTextFile('TEXT', '')
print('Original pages:', h.PageCount, flush=True)
for old, new in replacements:
    assert before.count(old) == 1, repr(old)
    h.HAction.GetDefault('AllReplace', h.HParameterSet.HFindReplace.HSet)
    p = h.HParameterSet.HFindReplace
    p.FindString, p.ReplaceString = old, new
    p.IgnoreMessage, p.FindRegExp, p.MatchCase = 1, 0, 1
    h.HAction.Execute('AllReplace', p.HSet)
after = h.GetTextFile('TEXT', '')
(root / 'author_debug.txt').write_text(after, encoding='utf-8')
norm = lambda s: s.replace('\r', '').replace('\n', '')
for old, new in replacements:
    assert norm(new) in norm(after), repr(new)
# Ensure all non-target text is unchanged, allowing HWP paragraph line endings.
expected = before
for old, new in replacements:
    expected = expected.replace(old, new)
assert norm(after) == norm(expected), 'Unexpected change outside author metadata'
assert h.SaveAs(str(output), 'HWP', '')
(root / '저자표시_수정검증.txt').write_text(after, encoding='utf-8')
print('Saved pages:', h.PageCount, flush=True)
print(str(output), flush=True)
h.HAction.Run('MoveDocBegin')

