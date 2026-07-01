// Tiny hand-rolled JSON-Schema (draft-07 subset) validator.
// Supports exactly the keywords used by options.schema.json:
//   type, required, properties, additionalProperties, enum, const,
//   pattern, minLength, minItems, maxItems, items.
// Returns { valid, errors: [{ path, message }] }.

function typeOf(value) {
  if (value === null) return "null";
  if (Array.isArray(value)) return "array";
  return typeof value; // object | string | number | boolean
}

function matchesType(value, type) {
  switch (type) {
    case "object":
      return value !== null && typeof value === "object" && !Array.isArray(value);
    case "array":
      return Array.isArray(value);
    case "string":
      return typeof value === "string";
    case "number":
      return typeof value === "number";
    case "integer":
      return typeof value === "number" && Number.isInteger(value);
    case "boolean":
      return typeof value === "boolean";
    case "null":
      return value === null;
    default:
      return false;
  }
}

function validateNode(value, schema, path, errors) {
  if (!schema || typeof schema !== "object") return;

  if (schema.type !== undefined) {
    const types = Array.isArray(schema.type) ? schema.type : [schema.type];
    if (!types.some((t) => matchesType(value, t))) {
      errors.push({
        path,
        message: `expected type ${types.join(" | ")} but got ${typeOf(value)}`,
      });
      // Type mismatch — further keyword checks are unreliable; stop here.
      return;
    }
  }

  if (schema.const !== undefined && value !== schema.const) {
    errors.push({ path, message: `must equal ${JSON.stringify(schema.const)}` });
  }

  if (schema.enum !== undefined && !schema.enum.includes(value)) {
    errors.push({
      path,
      message: `must be one of ${schema.enum.map((v) => JSON.stringify(v)).join(", ")}`,
    });
  }

  if (typeof value === "string") {
    if (schema.minLength !== undefined && value.length < schema.minLength) {
      errors.push({ path, message: `must be at least ${schema.minLength} characters` });
    }
    if (schema.pattern !== undefined) {
      let re;
      try {
        re = new RegExp(schema.pattern);
      } catch {
        re = null;
      }
      if (re && !re.test(value)) {
        errors.push({ path, message: `must match pattern ${schema.pattern}` });
      }
    }
  }

  if (Array.isArray(value)) {
    if (schema.minItems !== undefined && value.length < schema.minItems) {
      errors.push({ path, message: `must have at least ${schema.minItems} item(s)` });
    }
    if (schema.maxItems !== undefined && value.length > schema.maxItems) {
      errors.push({ path, message: `must have at most ${schema.maxItems} item(s)` });
    }
    if (schema.items) {
      value.forEach((item, i) => {
        validateNode(item, schema.items, `${path}[${i}]`, errors);
      });
    }
  }

  if (matchesType(value, "object")) {
    if (Array.isArray(schema.required)) {
      for (const key of schema.required) {
        if (!(key in value)) {
          errors.push({ path: path ? `${path}.${key}` : key, message: "is required" });
        }
      }
    }
    const props = schema.properties || {};
    for (const [key, val] of Object.entries(value)) {
      const childPath = path ? `${path}.${key}` : key;
      if (props[key]) {
        validateNode(val, props[key], childPath, errors);
      } else if (schema.additionalProperties === false) {
        errors.push({ path: childPath, message: "is not an allowed property" });
      } else if (schema.additionalProperties && typeof schema.additionalProperties === "object") {
        validateNode(val, schema.additionalProperties, childPath, errors);
      }
    }
  }
}

export function validate(value, schema) {
  const errors = [];
  validateNode(value, schema, "", errors);
  return { valid: errors.length === 0, errors };
}

export function formatErrors(errors) {
  return errors
    .map((e) => `  - ${e.path || "(root)"}: ${e.message}`)
    .join("\n");
}
