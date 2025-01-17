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
  | { type: "choice"; expr: Expr[] }
  | { type: "seq"; expr: Expr[] }
  | { type: "plus"; expr: Expr[] }
  | { type: "star"; expr: Expr[] }
  | { type: "opt"; expr: Expr[] }
  | { type: "range"; expr: Expr[] }
  // TODO   value should be NodeType
  | { type: "name"; value: any };

export class TokenStream {
  inline: boolean | null = null;
  pos: number = 0;
  tokens: string[] = [];

  constructor(
    readonly string: string,
    readonly nodeTypes: { readonly [key: string]: NodeType }
  ) {
    this.tokens = string.split(/\s*(?=\b|\W|$)/);
    console.log("tokens", this.tokens);
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

function parseExpr(stream: TokenStream): Expr {
  const expr: Expr[] = [];
  do {
    expr.push(parseExprSeq(stream));
  } while (stream.eat("|"));

  return expr.length === 1 ? expr[0] : { type: "choice", expr };
}

function parseExprSeq(stream: TokenStream): Expr {
  const expr: Expr[] = [];
  do {
    expr.push(parseExprSubscript(stream));
  } while (stream.next && stream.next !== ")" && stream.next !== "|");
  return expr.length === 1 ? expr[0] : { type: "seq", expr };
}

function parseExprSubscript(stream: TokenStream): Expr {
  let expr = parseExprAtom(stream);

  for (;;) {
    if (stream.eat("+")) {
      return {
        type: "plus",
        expr
      };
    } else if (stream.eat("*")) {
      return {
        type: "star",
        expr
      };
    } else if (stream.eat("?")) {
      return {
        type: "opt",
        expr
      };
    } else if (stream.next === "{") {
      return parseExprRange(stream, expr);
    } else {
      break;
    }
  }

  return expr;
}

function resolveName(stream: TokenStream, name: string): readonly NodeType[] {
  let types = stream.nodeTypes, type = types[name]
  if (type) return [type]
  let result: NodeType[] = []
  for (let typeName in types) {
    let type = types[typeName]
    if (type.isInGroup(name)) result.push(type)
  }
  if (result.length == 0) stream.err("No node type or group '" + name + "' found")
  return result
}

function parseExprAtom(stream: TokenStream): Expr {
  if (stream.eat("(")) {
    const expr = parseExpr(stream);
    if (!stream.eat(")")) {
      stream.err("Unmatched ')'");
    }

    return expr;
  } else if (!/\W/.test(stream.next)) {
    let exprs = resolveName(stream, stream.next).map((type) => {
      return {
        type: "name",
        value: type
      } as Expr;
    });
    stream.pos++;
    return exprs.length === 1
      ? exprs[0]
      : {
          type: "choice",
          expr: exprs
        };
  } else {
    stream.err("Unexpected token '" + stream.next + "'");
  }
}
