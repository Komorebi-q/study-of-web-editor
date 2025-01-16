/**
 * - choice: |
 * - seq: ()
 * - plus: +
 * - star: *
 * - opt: ?
 * - range: {min, max}
 * - name: NodeType
 */

// TODO temporary type
type NodeType = { type: string };

type Expr =
  | { type: "choice"; exprs: Expr[] }
  | { type: "seq"; exprs: Expr[] }
  | { type: "plus"; exprs: Expr[] }
  | { type: "star"; exprs: Expr[] }
  | { type: "opt"; exprs: Expr[] }
  | { type: "range"; exprs: Expr[] }
  // TODO   value should be NodeType
  | { type: "name"; value: any };

class TokenString {
  inline: boolean | null = null;
  pos: number = 0;
  tokens: string[] = [];

  constructor(
    readonly string: string,
    readonly nodeTypes: { readonly [key: string]: NodeType }
  ) {
    this.tokens = string.split("s*(=?\b|W|$)");
    if (this.tokens[0] === "") {
      this.tokens.shift();
    }
    if (this.tokens[this.tokens.length - 1] === "") {
      this.tokens.pop();
    }
  }

  get next() {
    return this.tokens[this.pos];
  }

  eat(string: string) {
    return this.next === string && (this.pos++ || true);
  }

  err(str: string): never {
    throw new SyntaxError(
      str + " (in content expression '" + this.string + "')"
    );
  }
}
