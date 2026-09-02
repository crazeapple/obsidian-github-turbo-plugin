#!/bin/sh
# mdlint.sh — SDD 治理 Markdown 规范校验
# 用法：sh sdd/tools/mdlint.sh <文件或目录>...
# 规格源：sdd/CONSTITUTION.md「Markdown 书写规范」校验节
#   error  ：行内反引号不配对、`**` 行内不配对、全角圆括号/直角引号文件级不配对
#   warning：中英文粘连（剥离行内代码后）、无序列表标记非 `-`、表格行列数与表头不一致
#   豁免   ：代码围栏与行内代码内容
# 退出码：存在 error 为 1，否则 0

lint_file() {
  perl - "$1" <<'PERL'
use strict;
use warnings;
use open qw(:std :encoding(UTF-8));

my $file = shift;
open(my $fh, '<:encoding(UTF-8)', $file) or die "mdlint: cannot open $file: $!\n";
my @lines = <$fh>;
close $fh;

my $err = 0;
my $warn = 0;
my $in_fence = 0;
my (@body, @plain);          # body：非围栏行（保留原样）；plain：剥离行内代码后的行
my @src_line;                # body 行对应的原文件行号

for my $i (0 .. $#lines) {
  my $l = $lines[$i];
  if ($l =~ /^\s*(```+|~~~+)/) { $in_fence = !$in_fence; next; }
  next if $in_fence;
  push @body, $l;
  push @src_line, $i + 1;
}

for my $i (0 .. $#body) {
  my $l = $body[$i];
  my $n = $src_line[$i];
  my $s = $l;

  # error：行内反引号不配对
  my $ticks = () = $l =~ /`/g;
  if ($ticks % 2 == 1) {
    printf "error: %s:%d: 行内反引号不配对\n", $file, $n;
    $err++;
    next;
  }
  # 剥离行内代码
  $s =~ s/`[^`]*`//g;

  # error：** 行内不配对（剥离行内代码后）
  my $stars = () = $s =~ /\*\*/g;
  if ($stars % 2 == 1) {
    printf "error: %s:%d: ** 不配对\n", $file, $n;
    $err++;
  }
  # warning：中英文粘连（剥离行内代码后；× 依规范须与中文隔空格，纳入检查）
  if ($s =~ /[\x{4e00}-\x{9fff}][A-Za-z0-9×]/ || $s =~ /[A-Za-z0-9×][\x{4e00}-\x{9fff}]/) {
    printf "warning: %s:%d: 中英文粘连\n", $file, $n;
    $warn++;
  }
  # warning：无序列表标记非 -
  if ($l =~ /^\s*[*+]\s+/) {
    printf "warning: %s:%d: 无序列表标记非 -\n", $file, $n;
    $warn++;
  }

  push @plain, $s;
}

# warning：表格行列数与表头不一致（逐段连续 | 行；分隔行跳过；行内代码先剥离）
my $i = 0;
while ($i <= $#body) {
  my $l = $body[$i];
  if ($l !~ /^\s*\|/) { $i++; next; }
  my $s = $l;
  $s =~ s/`[^`]*`//g;
  if ($s =~ /^\s*\|[\s:\-]*\|\s*$/) { $i++; next; }   # 单独分隔行不成表
  my $head = ($s =~ tr/|//) - 1;
  my $j = $i + 1;
  my $rownum = 1;
  while ($j <= $#body && $body[$j] =~ /^\s*\|/) {
    my $t = $body[$j];
    $t =~ s/`[^`]*`//g;
    if ($t =~ /^\s*\|[\s:\-]*\|\s*$/) { $j++; $rownum++; next; }
    my $c = ($t =~ tr/|//) - 1;
    if ($c != $head) {
      printf "warning: %s:%d: 表格行列数与表头不一致（表头 %d 列，第 %d 行 %d 列）\n", $file, $src_line[$j], $head, $rownum + 1, $c;
      $warn++;
    }
    $j++;
    $rownum++;
  }
  $i = $j;
}

# error：全角圆括号/直角引号文件级配对（对剥离行内代码后的全文）
my $full = join('', @plain);
my $open_p = () = $full =~ /（/g;
my $close_p = () = $full =~ /）/g;
if ($open_p != $close_p) {
  printf "error: %s: 全角圆括号不配对（（ %d 个，） %d 个）\n", $file, $open_p, $close_p;
  $err++;
}
my $open_q = () = $full =~ /「/g;
my $close_q = () = $full =~ /」/g;
if ($open_q != $close_q) {
  printf "error: %s: 直角引号不配对（「 %d 个，」 %d 个）\n", $file, $open_q, $close_q;
  $err++;
}

printf "mdlint: %s: %d error, %d warning\n", $file, $err, $warn;
exit($err ? 1 : 0);
PERL
}

err_sum=0
if [ $# -eq 0 ]; then
  printf '用法：sh sdd/tools/mdlint.sh <文件或目录>...\n' >&2
  exit 2
fi

for target in "$@"; do
  if [ -d "$target" ]; then
    for f in $(find "$target" -name '*.md' -type f | sort); do
      lint_file "$f" || err_sum=$((err_sum + 1))
    done
  elif [ -f "$target" ]; then
    lint_file "$target" || err_sum=$((err_sum + 1))
  else
    printf 'mdlint: 跳过不存在：%s\n' "$target" >&2
  fi
done

if [ "$err_sum" -gt 0 ]; then
  printf 'mdlint: 共 %d 个文件存在 error\n' "$err_sum" >&2
  exit 1
fi
exit 0
