//! The one inline-style policy shared by every adapter.
//!
//! - Property names: CSSOM camelCase (`backgroundColor`, `webkitTransform`, `cssFloat`) and
//!   CSS kebab-case (`background-color`, `--custom`) both resolve through
//!   [`css_property_name`]. Adapters pass the name they received; they do not convert it.
//! - Values are parsed, validated and serialized by Stylo (via Blitz). An invalid value is
//!   ignored (CSSOM `setProperty` semantics), an empty value removes the property.
//! - The canonical state is the element's `style` attribute; no adapter keeps a copy.
//!
//! [`MOTION_PROPERTIES`] lists the subset the contract suite checks in every engine. Other
//! properties Stylo supports also work; the list is a test promise, not a filter.

/// Properties whose set/get/computed behaviour is contract-tested in every adapter.
pub const MOTION_PROPERTIES: &[&str] = &[
    "opacity",
    "transform",
    "width",
    "height",
    "background",
    "left",
    "top",
    "right",
    "bottom",
    "display",
    "position",
    "color",
    "background-color",
    "font-size",
    "font-weight",
    "letter-spacing",
    "border-radius",
    "transform-origin",
    "visibility",
];

/// Map a CSSOM attribute name or a CSS property name to the CSS property name.
/// Returns `None` for names that cannot be CSS properties (symbols, indices, methods).
pub fn css_property_name(name: &str) -> Option<String> {
    if name.starts_with("--") {
        return (name.len() > 2).then(|| name.to_string());
    }
    let valid = name
        .chars()
        .enumerate()
        .all(|(i, c)| c.is_ascii_alphabetic() || (i > 0 && (c.is_ascii_digit() || c == '-')) || (i == 0 && c == '-'));
    if name.is_empty() || !valid {
        return None;
    }
    match name {
        "cssFloat" => return Some("float".into()),
        "cssText" | "length" | "parentRule" => return None,
        _ => {}
    }
    let mut kebab = String::with_capacity(name.len() + 4);
    for c in name.chars() {
        if c.is_ascii_uppercase() {
            kebab.push('-');
            kebab.push(c.to_ascii_lowercase());
        } else {
            kebab.push(c);
        }
    }
    // Vendor-prefixed IDL names (webkitTransform) map to dashed prefixes (-webkit-transform).
    for prefix in ["webkit-", "moz-", "ms-"] {
        if kebab.starts_with(prefix) {
            kebab.insert(0, '-');
            break;
        }
    }
    Some(kebab)
}

/// Is `name` (CSS property name) a property the style engine supports? Custom properties are
/// not "supported" here, matching the `in` operator on `CSSStyleDeclaration` in browsers.
pub fn is_supported_property(name: &str) -> bool {
    css_property_name(name).is_some_and(|n| blitz_dom::css_property_is_supported(&n))
}

/// Property names declared in a canonical `cssText`, in order (`style.length`/`item()`).
pub(crate) fn declared_names(css_text: &str) -> Vec<String> {
    let mut names = Vec::new();
    let mut depth = 0i32;
    let mut quote: Option<char> = None;
    let mut start = 0;
    let bytes: Vec<char> = css_text.chars().collect();
    let mut decls = Vec::new();
    for (i, &c) in bytes.iter().enumerate() {
        match (quote, c) {
            (Some(q), _) if c == q => quote = None,
            (Some(_), _) => {}
            (None, '"' | '\'') => quote = Some(c),
            (None, '(') => depth += 1,
            (None, ')') => depth -= 1,
            (None, ';') if depth == 0 => {
                decls.push(bytes[start..i].iter().collect::<String>());
                start = i + 1;
            }
            _ => {}
        }
    }
    decls.push(bytes[start..].iter().collect::<String>());
    for decl in decls {
        if let Some((name, _)) = decl.split_once(':') {
            let name = name.trim();
            if !name.is_empty() {
                names.push(name.to_string());
            }
        }
    }
    names
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn names() {
        assert_eq!(css_property_name("backgroundColor").as_deref(), Some("background-color"));
        assert_eq!(css_property_name("background-color").as_deref(), Some("background-color"));
        assert_eq!(css_property_name("webkitTransform").as_deref(), Some("-webkit-transform"));
        assert_eq!(css_property_name("cssFloat").as_deref(), Some("float"));
        assert_eq!(css_property_name("--my-var").as_deref(), Some("--my-var"));
        assert_eq!(css_property_name("0"), None);
        assert_eq!(css_property_name("cssText"), None);
        assert_eq!(css_property_name(""), None);
    }

    #[test]
    fn declared() {
        assert_eq!(declared_names("opacity: 0.5; background: url(\"a;b\") red; --x: 1"), vec!["opacity", "background", "--x"]);
        assert!(declared_names("").is_empty());
    }
}
