import { test, expect } from "vitest";
import { TokenString } from "../content";

test("content TokenString", () => {
  const tokenString = new TokenString(
    "heading{1,3} (text | image)+ paragraph?",
    { a: { type: "a" } }
  );
  const res = [
    "heading",
    "{",
    "1",
    ",",
    "3",
    "}",
    "(",
    "text",
    "|",
    "image",
    ")",
    "+",
    "paragraph",
    "?"
  ];
  for (const item of res) {
    expect(tokenString.next).toBe(item);
    const ret = tokenString.eat(item);
    if (typeof ret === "boolean") {
      expect(ret).toBe(true);
    } else {
      expect(ret).toBe(tokenString.pos-1);
    }
  }
});
test("content expression", () => {
  expect(1 + 1).toBe(2);
});
