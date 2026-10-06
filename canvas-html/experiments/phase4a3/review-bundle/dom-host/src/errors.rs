use std::fmt;

/// Engine-neutral DOM errors. Every adapter maps them with [`DomError::js_error`], so Boa and
/// Deno throw the same exception type and name for the same failure.
#[derive(Clone, Debug, PartialEq, Eq)]
pub enum DomError {
    /// The handle no longer resolves to a node (the native node was dropped).
    InvalidHandle,
    /// The node exists but is not an element where an element is required.
    NotAnElement,
    /// The selector does not parse.
    InvalidSelector(String),
    /// A `classList` token is empty.
    EmptyToken,
    /// A `classList` token contains ASCII whitespace.
    InvalidCharacter(String),
    /// The operation is outside the supported subset.
    UnsupportedOperation(String),
    /// The operation is not allowed in the current state.
    InvalidState(String),
}

pub type DomResult<T> = Result<T, DomError>;

/// What kind of JavaScript exception an error becomes.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum JsErrorKind {
    /// `new DOMException(message, name)`
    DomException(&'static str),
    /// `new TypeError(message)`
    TypeError,
}

impl DomError {
    /// The JavaScript exception every adapter throws for this error.
    pub fn js_error(&self) -> JsErrorKind {
        match self {
            DomError::InvalidHandle | DomError::InvalidState(_) => JsErrorKind::DomException("InvalidStateError"),
            DomError::NotAnElement => JsErrorKind::TypeError,
            DomError::InvalidSelector(_) | DomError::EmptyToken => JsErrorKind::DomException("SyntaxError"),
            DomError::InvalidCharacter(_) => JsErrorKind::DomException("InvalidCharacterError"),
            DomError::UnsupportedOperation(_) => JsErrorKind::DomException("NotSupportedError"),
        }
    }

    /// Stable short code, used by adapters that move errors across a string boundary.
    pub fn code(&self) -> &'static str {
        match self {
            DomError::InvalidHandle => "InvalidHandle",
            DomError::NotAnElement => "NotAnElement",
            DomError::InvalidSelector(_) => "InvalidSelector",
            DomError::EmptyToken => "EmptyToken",
            DomError::InvalidCharacter(_) => "InvalidCharacter",
            DomError::UnsupportedOperation(_) => "UnsupportedOperation",
            DomError::InvalidState(_) => "InvalidState",
        }
    }
}

impl fmt::Display for DomError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            DomError::InvalidHandle => write!(f, "the node no longer exists"),
            DomError::NotAnElement => write!(f, "the node is not an element"),
            DomError::InvalidSelector(s) => write!(f, "{s:?} is not a valid selector"),
            DomError::EmptyToken => write!(f, "the token must not be empty"),
            DomError::InvalidCharacter(t) => write!(f, "the token {t:?} contains whitespace"),
            DomError::UnsupportedOperation(what) => write!(f, "html-renderer: {what} is not supported"),
            DomError::InvalidState(what) => write!(f, "{what}"),
        }
    }
}

impl std::error::Error for DomError {}
