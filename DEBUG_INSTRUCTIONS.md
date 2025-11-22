# 🔍 Инструкция по отладке CodeMirror

## 🚨 Проблема
CodeMirror не показывается и код обфусцированный.

## ✅ Шаги для проверки:

### 1. Откройте админку
```
http://localhost:3000/admin?pass=admin123&page=scripts
```

### 2. Откройте консоль браузера
- **Chrome/Edge**: Нажмите `F12` или `Ctrl+Shift+I`
- **Firefox**: Нажмите `F12`
- Перейдите на вкладку "Console"

### 3. Нажмите "Edit" на любом скрипте

### 4. Проверьте что показывается в консоли:

#### ✅ Должно быть:
```
📝 Editing script: ESP Hack V2
Versions: 1
Has rawContent: true
Code length: 440
Code preview: -- ESP Script for Roblox
local player = game.Players.LocalPlayer...
Initializing CodeMirror...
✓ Editor initialized
✓ Code set in editor
```

#### ❌ Если видите:
```
Has rawContent: false
```
**Проблема**: Старые скрипты не имеют rawContent

**Решение**: Создайте новый скрипт заново!

---

## 🔧 Решение 1: Создать новый скрипт

1. Нажмите "New Script"
2. Введите код
3. Сохраните
4. Попробуйте редактировать - должен работать CodeMirror!

---

## 🔧 Решение 2: Если CodeMirror всё равно не показывается

### Проверьте загрузку библиотек:

1. Откройте консоль (F12)
2. Напишите:
```javascript
typeof CodeMirror
```

#### ✅ Должно быть: `"function"`
#### ❌ Если `"undefined"` - библиотека не загрузилась

### Если библиотека не загрузилась:

Проверьте Network (вкладка в F12):
- `codemirror.min.css` - должен быть 200 OK
- `dracula.min.css` - должен быть 200 OK  
- `codemirror.min.js` - должен быть 200 OK
- `lua.min.js` - должен быть 200 OK

---

## 🔧 Решение 3: Очистить кэш

1. В браузере нажмите `Ctrl+Shift+Delete`
2. Выберите "Изображения и файлы в кэше"
3. Очистить
4. Перезагрузите страницу `Ctrl+F5`

---

## 🧪 Тестирование

### Откройте тестовую страницу:
```
file:///C:/Users/New/Documents/trae_projects/123/test_editor.html
```

Если там CodeMirror работает → проблема в интеграции
Если не работает → проблема с загрузкой библиотеки

---

## 📝 Ожидаемый результат:

Когда нажимаете "Edit" должен показаться такой редактор:

```
╔══════════════════════════════════════════════════╗
║  Edit Script                                  [X]║
╠══════════════════════════════════════════════════╣
║  Script Name:                                    ║
║  ┌────────────────────────────────────────────┐ ║
║  │ ESP Hack V2                                │ ║
║  └────────────────────────────────────────────┘ ║
║                                                  ║
║  Lua Code:                                       ║
║  ┌──┬──────────────────────────────────────────┐║
║  │1 │-- ESP Script for Roblox                  │║
║  │2 │local player = game.Players.LocalPlayer   │║
║  │3 │local camera = workspace.CurrentCamera    │║
║  │4 │                                           │║
║  │5 │-- Configuration                          │║
║  └──┴──────────────────────────────────────────┘║
║  440 characters                                  ║
║                                                  ║
║  [✓] Enable Script    [✓] Obfuscate Code        ║
║  [ Save Script ]                [ Cancel ]       ║
╚══════════════════════════════════════════════════╝
```

**С подсветкой синтаксиса и номерами строк!**

---

## 💡 Если ничего не помогает:

Скопируйте в консоль и отправьте результат:

```javascript
console.log({
  CodeMirror: typeof CodeMirror,
  editor: typeof editor,
  modal: document.getElementById('scriptModal'),
  editorDiv: document.getElementById('codeEditor'),
  textarea: document.getElementById('scriptContent')
});
```

---

## 🆘 Быстрое решение:

**Просто создайте НОВЫЙ скрипт:**
1. New Script
2. Введите код:
```lua
print('Test script')
```
3. Сохраните
4. Нажмите Edit на этом скрипте

**Должен сработать CodeMirror!**

Старые скрипты (созданные до обновления) могут не иметь rawContent поля.

