"use strict";

const DEFAULT_LAYOUT = ["qwertyuiop", "asdfghjkl", "zxcvbnm"];
const NUM_ROWS = DEFAULT_LAYOUT.length;

// px
const DESKTOP_WIDTH = 500;

// Relative widths of different key types
const KEY_WIDTH = 50; // "Standard" letter key
const BACKSPACE_WIDTH = 80;
const ENTER_WIDTH = 60;

const ROW_OFFSETS = {
  [0]: 0,
  [1]: 0.5,
  [2]: 1.5,
};

// let screenWidth; // Updated by media query at bottom of this file

/** @type {Element} */
let textBoxEl;

/**
 * Global keyboard instance
 * @type {Keyboard} */
let keyboard;

/** @typedef {{element: Element, x: number, y: number, width: number, height: number}} FlexItemInfo */

class Keyboard {
  /**
   * Creates a new keyboard filled with keys with a default QWERTY layout
   * @param {Element} keyboardEl
   */
  constructor(keyboardEl) {
    this.keyboardEl = keyboardEl;
    this.keyPressPreview = new KeyPressPreview();

    /** @type {KeyboardRow[]} */
    this.keyRows = DEFAULT_LAYOUT.map((rowStr) => {
      const rowEl = document.createElement("span");
      rowEl.className = "keyboard-row";

      const rowWrapper = document.createElement("div");
      rowWrapper.className = "row-wrapper";

      rowWrapper.append(rowEl);
      keyboardEl.append(rowWrapper);
      const keys = rowStr
        .split("")
        .map(
          (char) =>
            new Key({ displayStr: char, keyboard: this, parentEl: rowEl })
        );

      return new KeyboardRow(rowEl, keys);
    });

    this.keyRows[0].keys.push(
      new Key({
        displayStr: "←",
        keyboard: this,
        parentEl: this.keyRows[0].rowEl,
        width: BACKSPACE_WIDTH,
        onPress: Keyboard.backspace,
      })
    );
    this.keyRows[1].keys.push(
      new Key({
        displayStr: "↵",
        keyboard: this,
        parentEl: this.keyRows[1].rowEl,
        width: ENTER_WIDTH,
        onPress: Keyboard.enter,
      })
    );

    const createSpaceEls = (rowNum, parent) => {
      // span to allow last-of-type in CSS
      const el1 = document.createElement("span");
      const el2 = document.createElement("span");
      el1.style.flexBasis = el2.style.flexBasis =
        ROW_OFFSETS[rowNum] * KEY_WIDTH + "px";
      el1.style.display = el2.style.display = "inline-block";
      parent.before(el1);
      parent.after(el2);
    };

    // Invisible layout divs
    for (let row = 0; row < this.keyRows.length; row++) {
      const keyRow = this.keyRows[row];
      createSpaceEls(row, keyRow.rowEl);
    }
  }

  // Special keypresses
  static backspace() {
    textBoxEl.value = textBoxEl.value.slice(0, -1);
  }
  static enter() {
    textBoxEl.value += "\n";
  }

  /**
   * Get the key at the specified row and col. Returns null if out of bounds
   * @param {number} row
   * @param {number} col
   * @returns {Key?}
   */
  getKey(row, col) {
    if (
      row < 0 ||
      row >= this.keyRows.length ||
      col < 0 ||
      col >= this.keyRows[row].length
    )
      return null;
    const keyRow = this.keyRows[row];
    return keyRow.keys[col];
  }

  /**
   *
   * @param {Key} key
   * @returns {{row: number, col: number}}
   */
  getKeyPos(key) {
    // TODO: optimize?
    for (let row = 0; row < this.keyRows.length; row++) {
      const foundKeyIndex = this.keyRows[row].keys.findIndex((k) => k === key);
      if (foundKeyIndex !== -1) return { row, col: foundKeyIndex };
    }

    console.error("Couldn't find key in keyboard", { key, keyboard: this });
  }

  /**
   * Move a Key from one place to another. Handles changing position in both DOM
   * and the Keyboard
   * @param {Key} key
   * @param {number} fromRow
   * @param {number} fromCol
   * @param {number} toRow
   * @param {number} toCol
   */
  moveKey(key, fromRow, fromCol, toRow, toCol) {
    console.assert(
      this.keyRows[fromRow].rowEl.children.item(fromCol) === key.keyEl,
      this.keyRows[fromRow].rowEl.children.item(fromCol),
      key.keyEl
    );

    // Remove from DOM and keyRow
    this.keyRows[fromRow].rowEl.removeChild(key.keyEl);
    this.keyRows[fromRow].keys.splice(fromCol, 1);

    //Add it at the new position in DOM and keyRow
    const newRowEl = this.keyRows[toRow].rowEl;
    newRowEl.insertBefore(key.keyEl, newRowEl.children.item(toCol));
    this.keyRows[toRow].keys.splice(toCol, 0, key);
  }

  /**
   * Sorts the pressed key into the top left and shuffles the rest to fit
   * Thanks https://stackoverflow.com/a/53618561
   * @param {Key} pressedKey
   */
  sortKeys(pressedKey) {
    const { row: oldRow, col: oldCol } = this.getKeyPos(pressedKey);

    const oldFlexItemsInfo = this.getFlexItemsInfo();
    // Remove the pressed key and add it back at 0,0
    this.moveKey(pressedKey, oldRow, oldCol, 0, 0);

    // Shuffle last element down from row i to row i+1 (pressedKey's old row) number of times - 0 if it
    // was on top row, 1 if on row 1, etc.
    for (let i = 0; i < oldRow; i++) {
      const keysArr = this.keyRows[i].keys;
      // Move to next row at column 0 (left)
      const key = keysArr[keysArr.length - 1];
      this.moveKey(key, i, keysArr.length - 1, i + 1, 0);
    }

    const newFlexItemsInfo = this.getFlexItemsInfo();
    this.animateFlexItems(oldFlexItemsInfo, newFlexItemsInfo);
  }

  /**
   * Gets info about an element's position, needed for animating flex elements.
   * Thanks https://stackoverflow.com/a/53618561
   * @returns {Array<FlexItemInfo>}
   */
  getFlexItemsInfo() {
    return Array.from(this.keyboardEl.querySelectorAll(".key")).map((item) => {
      const rect = item.getBoundingClientRect();
      return {
        element: item,
        x: rect.left,
        y: rect.top,
        width: rect.right - rect.left,
        height: rect.bottom - rect.top,
      };
    });
  }

  /**
   * @param {FlexItemInfo[]} oldFlexItemsInfo
   * @param {FlexItemInfo[]} newFlexItemsInfo
   */
  animateFlexItems(oldFlexItemsInfo, newFlexItemsInfo) {
    for (const newFlexItemInfo of newFlexItemsInfo) {
      const oldFlexItemInfo = oldFlexItemsInfo.find(
        (itemInfo) => itemInfo.element === newFlexItemInfo.element
      );

      const translateX = oldFlexItemInfo.x - newFlexItemInfo.x;
      const translateY = oldFlexItemInfo.y - newFlexItemInfo.y;
      const scaleX = oldFlexItemInfo.width / newFlexItemInfo.width;
      const scaleY = oldFlexItemInfo.height / newFlexItemInfo.height;

      newFlexItemInfo.element.animate(
        [
          {
            transform: `translate(${translateX}px, ${translateY}px) scale(${scaleX}, ${scaleY})`,
          },
          { transform: "none" },
        ],
        {
          duration: 150,
          easing: "ease-out",
        }
      );
    }
  }
}

class KeyboardRow {
  /**
   *
   * @param {Element} rowEl
   * @param {Key[]} keys
   */
  constructor(rowEl, keys) {
    this.rowEl = rowEl;
    this.keys = keys;
  }
}

class Key {
  /**
   * Creates a new key on the keyboard, including adding it to the DOM by appending it to parentEl
   * @param {Object} obj
   * @param {string} obj.displayStr String (char) to display on this key
   * @param {Keyboard} obj.keyboard Containing keyboard
   * @param {Element} obj.parentEl Containing DOM element (row)
   * @param {number?} obj.width Optional width; if not passed, the key will use a default width
   * @param {Function?} obj.onPress Optional function; if not passed, the key will write its displayStr on press
   */
  constructor({ displayStr, keyboard, parentEl, width, onPress }) {
    this.displayStr = displayStr;
    this.width = width || KEY_WIDTH;
    this.keyboard = keyboard;
    this.onPress = () => {
      // Type the key
      (onPress || (() => (textBoxEl.value += displayStr)))();

      // Re-sort it to the top-left
      keyboard.sortKeys(this);
    };

    const keyEl = document.createElement("div");
    keyEl.className = "key";
    keyEl.innerText = displayStr;
    keyEl.style.flexBasis = this.width + "px";
    keyEl.addEventListener("pointerup", this.onPress);

    parentEl.appendChild(keyEl);
    this.keyEl = keyEl;

    // Register pointer events for showing pressed style and the key press preview
    keyboard.keyPressPreview.registerPointerEvents(this);
  }
}

class KeyPressPreview {
  shown = false;
  previewEl;

  static Y_OFF = -60; // px

  constructor() {
    const previewEl = document.createElement("div");
    previewEl.style.top = "-200px"; // Off the screen
    previewEl.className = "preview";
    document.body.append(previewEl);

    // When the pointer is released, hide the preview
    document.addEventListener("pointerup", (e) => {
      this.hide();
    });

    this.previewEl = previewEl;
  }

  /**
   * Call this with each key to make it visually respond to touches
   * @param {Key} key
   */
  registerPointerEvents(key) {
    // When the pointer moves over a key, make it "pressed" and show its preview
    key.keyEl.onpointerdown = key.keyEl.onpointerover = (e) => {
      const pressed = e.buttons !== 0;
      if (pressed) {
        key.keyEl.classList.add("pressed");
        this.show(key);
      }
    };

    // When the pointer leaves, make it not pressed (but don't hide the preview
    // since the pointer might be over a different key now)
    key.keyEl.onpointerout = key.keyEl.onpointerup = (e) => {
      key.keyEl.classList.remove("pressed");
    };
  }

  /**
   * Show a floating box with the letter of the pressed key so the user can see
   * past their thumbs.
   * @param {Key} key
   */
  show(key) {
    // Set preview text content
    this.previewEl.innerText = key.keyEl.innerText;

    // Set position and content of the preview
    const keyRect = key.keyEl.getBoundingClientRect();
    const previewRect = this.previewEl.getBoundingClientRect();

    this.previewEl.style.left = `${
      keyRect.x + keyRect.width / 2 - previewRect.width / 2
    }px`;
    this.previewEl.style.top = `${keyRect.y + KeyPressPreview.Y_OFF}px`;
  }

  hide() {
    this.previewEl.style.top = "-200px"; // Off the screen
    this.previewEl.innerText = "";
  }
}

function removeElement(arr, toRemove) {
  const indexToRemove = arr.findIndex((el) => el === toRemove);
  arr.splice(indexToRemove, 1);
  return arr;
}

function init() {
  textBoxEl = document.getElementById("text");
  // Clear textbox; doesn't automatically clear on reload
  textBoxEl.value = "";
  const keyboardEl = document.getElementById("keyboard");
  keyboard = new Keyboard(keyboardEl);
}

// window.addEventListener("resize", (e) => {
//   screenWidth = document.documentElement.clientWidth;
// });

window.onload = init;
