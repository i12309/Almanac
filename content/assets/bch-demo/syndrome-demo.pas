program SyndromeDemo;
{$mode objfpc}{$H+}

{ New teaching example for the Almanac mockup. Not a historical source.
  Binary BCH(15,7,5), GF(16), p(x)=x^4+x+1, g(x)=x^8+x^7+x^6+x^4+1.
  Bit i is the coefficient of x^i. This program computes syndromes only. }

const
  WordLength = 15;
  Primitive = $13;
  Generator = $1D1;
  MessageValue = $59; { 1011001 }

function GFMul(a, b: Byte): Byte;
var
  product: Byte;
begin
  product := 0;
  while b <> 0 do
  begin
    if (b and 1) <> 0 then product := product xor a;
    b := b shr 1;
    a := a shl 1;
    if (a and $10) <> 0 then a := a xor Primitive;
  end;
  GFMul := product;
end;

function GFPow(base: Byte; exponent: Integer): Byte;
var
  value: Byte;
begin
  value := 1;
  while exponent > 0 do
  begin
    if (exponent and 1) <> 0 then value := GFMul(value, base);
    base := GFMul(base, base);
    exponent := exponent shr 1;
  end;
  GFPow := value;
end;

function Encode(message: Word): Word;
var
  shifted, remainder: Word;
  bitIndex: Integer;
begin
  shifted := message shl 8;
  remainder := shifted;
  for bitIndex := 14 downto 8 do
    if (remainder and (Word(1) shl bitIndex)) <> 0 then
      remainder := remainder xor (Generator shl (bitIndex - 8));
  Encode := shifted or remainder;
end;

function Syndrome(received: Word; j: Integer): Byte;
var
  bitIndex: Integer;
  value: Byte;
begin
  value := 0;
  for bitIndex := 0 to WordLength - 1 do
    if (received and (Word(1) shl bitIndex)) <> 0 then
      value := value xor GFPow(2, (j * bitIndex) mod WordLength);
  Syndrome := value;
end;

procedure PrintWord(value: Word);
var
  bitIndex: Integer;
begin
  for bitIndex := WordLength - 1 downto 0 do
    Write((value shr bitIndex) and 1);
end;

var
  codeword, received: Word;
  j: Integer;
begin
  codeword := Encode(MessageValue);
  received := codeword xor (Word(1) shl 2) xor (Word(1) shl 9);
  Write('Codeword: '); PrintWord(codeword); Writeln;
  Write('Received: '); PrintWord(received); Writeln;
  Write('Syndromes (integer representation of GF(16) elements):');
  for j := 1 to 4 do Write(' ', Syndrome(received, j));
  Writeln;
end.
