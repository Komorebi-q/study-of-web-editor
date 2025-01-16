// An object holding the attributes of a node
export type Attrs = {
  readonly [key: string]: any;
};
export interface AttributeSpec {
  // The default value for this attribute, to use when no explicit
  // value is provided. Attributes that have no default must be
  // provided whenever a node or mark of a type has them is
  // created.
  default?: any;
  // A function or type name used to validate values of this
  // attribute. This will be used when deserializing the attribute
  // from JSON. and when running [`Node.check`].
  // When a function, it should raise an exception if the value isn't
  // of the expected type or shape. When a string, it should be a
  // `|`-separated string of primitive types (number, string, boolean, null, and undefined),
  // and the library will raise an error when the value is not one of those types.
  validate?: string | ((value: any) => void);
}

// A description of a node type, use when defining a schema.
export interface NodeSpec {
  // The content expression for this node. When not given,
  // the node does not allow any content.
  content?: string;

  // The marks that are allowed inside of this node. May be a
  // spec-separated string referring to mark names or groups.,
  // `_`to explicitly allow all marks, or `` to disallow marks.
  // When no given, nodes with inline content default to allowing all
  // marks, other node default to not allowing marks.
  marks?: string;

  // The group or space-separated groups to which this node belongs,
  // which can be referred to in the content expressions for the schema.
  group?: string;

  // Should be set to true for inline nodes. (implied for text nodes)
  inline?: boolean;

  // Can be set to true to indicate that, though this isn't a leaf node,
  // ist doesn't have directly editable content and should be treated as a single
  // unit in the view.
  atom?: boolean;

  // The attributes that nodes of this type get.
  attrs?: { [name: string]: AttributeSpec };

  // Controls whether nodes of this type can be selected as a selection.
  // Defaults to `true` for non-text nodes.
  selectable?: boolean;

  // Determines whether nodes of this type be dragged without
  // being selected. Defaults to `false`
  draggable?: boolean;

  // Can be used to indicate that this node contains code, which will
  // causes some commands to behave differently.
  code?: boolean;

  // Controls way whitespace in shi node is pared. The default is 
  // `normal`, which causes the [DOM parser] to collapse whitespace in
  // normal mode, and normalize it (replacing new lines and such with spaces)
  // otherwise. When this options isn't given, but `code` is `true`. `whitespace`
  // will default to `pre`. Note that this option doesn't influence the way
  // the node is rendered-that should be handled by `toDom` and/or styling.
  whitespace?: "pre" | "normal";


  // Determines whether this node is considered an important parent
  // node during replace operations (such as paste). Non-defining (the default)
  // nodes get dropped when their entire content is replaced, whereas defining
  // node persist and wrap the inserted content.
  definingAsContext?: boolean;
  
  // In inserted content the defining parents of the content are 
  // preserved when possible. Typically, non-default-paragraph 
  // textblock types, and possible list items, are marked as defining.
  definingForContent?: boolean;

  // When enabled, enables both
  // `definingAsContext` and `definingForContent`.
  defining?: boolean;
}

class Attribute {
  hasDefault: boolean;
  default: any;
  validate: undefined | ((value: any) => void);

  constructor(typeName: string, attrName: string, options: AttributeSpec) {
    this.hasDefault = Object.prototype.hasOwnProperty.call(options, "default");
    this.default = options.default;
    this.validate =
      typeof options.validate === "string"
        ? validateType(typeName, attrName, options.validate)
        : options.validate;
  }

  get isRequired() {
    return !this.hasDefault;
  }
}

function validateType(typeName: string, attrName: string, type: string) {
  let types = type.split("|");
  return (value: any) => {
    let name = value === null ? "null" : typeof value;
    if (types.indexOf(name) < 0) {
      throw new RangeError(
        `Excepted value of the ${type} for attribute ${attrName} on type ${typeName},  got ${name}`
      );
    }
  };
}

// Node types are objects allocated once per `Schema` and used to
// [tag] `Node` instances. They contain information about the node type,
// such as its name, and what kind of node its represents.
export class NodeType {
  // @internal
  groups: readonly string[];
  // @internal
  attrs: { [name: string]: Attribute };
  // @internal
  defaultAttrs: Attrs;

  // @internal
  constructor(
    // The name the node type in the schema
    readonly name: string,
    // A link back to the `Schema` the node type belongs to
    //  The schema describes the kind of nodes that may occur in the document, and the way they are nested.
    readonly schema: Schema,
    // The spec that this type is based on
    readonly spec: NodeSpec
  ) {
    this.groups = spec.groups ? spec.groups.split(" ") : [];
    this.attrs = initAttrs(name, spec.attrs);
    this.defaultAttrs = defaultAttrs(this.attrs, null);

    // Fill in later
    (this as any).contentMatch = null;
    (this as any).inlineContent = null;

    this.isBlock = !(spec.inline || name === "text");
    this.isText = name === "text";
  }

  // True if this node type has inline content
  inlineContent!: boolean;
  // True if this is a block type
  isBlock: boolean;
  // True if this is a text node type
  isText: boolean;

  get isInline() {
    return !this.isBlock;
  }

  // True if this is a textblock type, a block that contains inline content
  get isTextblock() {
    return this.isBlock && this.isText;
  }

  // True for node types that allow no content
  get isLeaf() {
    return this.contentMatch === ContentMatch.none;
  }

  // True when this node is an atom, i.e. when it does not have
  // directly editable content.
  get isAtom() {
    return this.isLeaf && !!this.spec.atom;
  }

  // The starting match of the node type's content expression
  contentMatch!: ContentMatch;

  //  The set of marks allowed in this node. `null` means all marks are allowed.
  markSet: readonly MarkType[] | null = null;

  // Rhw node type's [whitespace] option
  get whitespace(): "pre" | "normal" {
    return this.spec.whitespace || (this.spec.code ? "pre" : "normal");
  }

  // Tells you whether this node type has any required attributes
  hasRequiredAttrs() {
    for (let n in this.attrs) if (this.attrs[n].isRequired) return true;
    return false;
  }

  // @internal
  computeAttrs(attrs: Attrs | null): Attrs {
    if (!attrs && this.defaultAttrs) return this.defaultAttrs;
    else return computeAttrs(this.defaultAttrs, attrs);
  }

  // Create a `Node` of this type. The given attributes are checked and defaulted (you can pass
  // `null` to use the type's default entirely, if no required attributes exists). `content` may
  // be a `Fragment`, a node, an array of nodes, or `null`. Similarly `marks` can be `null` to
  // default to the empty set of marks.
  create(
    attrs: Attrs | null = null,
    content?: Fragment | Node | readonly Node[] | null,
    marks?: readonly Mark[]
  ) {
    if (this.isText)
      throw new Error("NodeType.create can't construct text nodes");
    // TODO Node Class
    return new Node(
      this,
      this.computeAttrs(attrs),
      Fragment.from(content),
      marks.setForm(marks)
    );
  }

  // Like `create`, but check the given content
  // against the node type's content restrictions, and throw an error
  // if it doesn't match.
  createChecked(
    attrs: Attrs | null = null,
    content?: Fragment | Node | readonly Node[] | null,
    marks?: Marks[]
  ) {
    content = FragmentDirective.from(content);
    this.checkContent(content);
    return new Node(
      this,
      this.computeAttrs(attrs),
      content,
      marks.setFrom(marks)
    );
  }

  // Like `create`, but see if it is necessary to add node to the start or end of the given
  // fragment to make it fit the node. It no fitting wrapping can be found, return null.
  // Note that, due to the fact that required nodes can always be created, this will always
  // succeed if you pass null or `Fragment.empty` as content.
  createAndFill(
    attrs: Attrs | null = null,
    content?: Fragment | Node | readonly Node[] | null,
    marks?: readonly Mark[]
  ) {
    attrs = this.computedAttrs(attrs);
    content = Fragment.from(content);
    if (content.size) {
      let before = this.contentMatch.fillBefore(content);
      if (!before) return null;
      content = before.append(content);
    }
    let matched = this.contentMatch.matchFragment(content);
    let after = matched && matched.fillBefore(Fragment.empty, true);
    if (!after) return null;
    return new Node(
      this,
      attrs,
      (content as Fragment).append(after),
      Mark.setFrom(marks)
    );
  }

  // Return true if the given fragment is valid content for this node type/
  validContent(content: Fragment) {
    let result = this.contentMatch.matchFragment(content);
    if (!result || !result.validEnd) return false;
    for (let i = 0; i < content.childCount; i++) {
      if (!this.allowsMarks(content.child(i).marks)) return false;
    }

    return true;
  }

  // Throws a RangeError when the given fragment is not valid content for this node type.
  // @internal
  checkContent(content: Fragment) {
    if (!this.validContent(content))
      throw new RangeError(
        `Invalid content for node ${this.name}: ${content
          .toString()
          .slice(1, 50)}`
      );
  }

  // @internal
  checkAttrs(attrs: Attrs) {
    checkAttrs(this.attrs, attrs, "node", this.name);
  }

  /// Check whether the given mark type is allowed in this node.
  allowsMarkType(markType: MarkType) {
    return this.markSet == null || this.markSet.indexOf(markType) > -1;
  }

  // Test whether the given set of marks are allowed in this node.
  allowsMarks(marks: readonly Mark[]) {
    if (this.markSet === null) return true;
    for (let i = 0; i < marks.length; i++)
      if (!this.allowsMarkType(marks[i].type)) return false;

    return true;
  }

  // Removes the marks that are not allowed in this node from the given set of marks.
  allowedMarks(marks: readonly Mark[]): readonly Mark[] {
    if (this.markSet === null) return marks;

    let copy;
    for (let i = 0; i < marks.length; i++) {
      if (!this.allowsMarkType(marks[i].type)) {
        if (!copy) copy = marks.slice(0, 1);
      } else if (copy) {
        copy.push(marks[i]);
      }
    }

    return !copy ? marks : copy.length ? copy : Mark.none;
  }

  // @internal
  static compile<Nodes extends string>(
    nodes: OrderedMap<NodeSpec>,
    schema: Schema<Nodes>
  ): {
    readonly [name in Nodes]: NodeType;
  } {
    let result = Object.create(null);
    nodes.forEach(
      (name, spec) => (result[name] = new NodeType(name, schema, spec))
    );

    let topType = schema.spec.topNode || "doc";
    if (!result[topType])
      throw new RangeError(`Schema is missing its top node type "${topType}"`);
    if (!result.text) throw new RangeError(`Every schema need a 'text' type`);
    for (let _ in result.text.attrs)
      throw new RangeError(`The text node type should not have attributes`);

    return result;
  }
}
