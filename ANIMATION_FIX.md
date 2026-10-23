# 🎬 Исправления анимации и движения моделей

## ✅ Что было исправлено

### 1. Добавлена система анимации
- **AnimationMixer**: создан для каждого персонажа (зомби и солдата)
- **AnimationCache**: анимации сохраняются при загрузке моделей
- **Обновление в игровом цикле**: все миксеры обновляются каждый кадр

### 2. Исправлено позиционирование моделей
- Модели теперь правильно добавляются в группу (`group.add(clone)`)
- Позиция устанавливается корректно (y=0 для ног на земле)
- Масштаб нормализован (1.0 для обычных моделей)

### 3. Добавлена обработка анимаций
```typescript
// Для зомби - ищем анимацию walk/run
let animationClip = animations.find(anim => 
  anim.name.toLowerCase().includes('walk') || 
  anim.name.toLowerCase().includes('run')
);

// Для солдат - ищем анимацию idle
let animationClip = animations.find(anim => 
  anim.name.toLowerCase().includes('idle')
);
```

## 🎮 Как это работает

### Загрузка моделей
1. GLTFLoader загружает модель и анимации
2. Анимации сохраняются в `animationCache`
3. Логируется количество анимаций: `📊 Model zombie: X meshes, Y vertices, Z animations`

### Создание персонажей
1. Создаётся пустая группа (`THREE.Group`)
2. Клонируется модель из кэша
3. Настраивается масштаб, позиция, поворот
4. Создаётся `AnimationMixer` для клона
5. Находится подходящая анимация (walk/run для зомби, idle для солдат)
6. Анимация запускается через `mixer.clipAction(animationClip).play()`
7. Миксер добавляется в список `animationMixers`
8. Клон добавляется в группу

### Игровой цикл
```typescript
// Каждый кадр обновляем все анимации
this.animationMixers.forEach(mixer => {
  mixer.update(delta);
});
```

## 🔍 Отладка

### Проверка в консоли браузера (F12)
```
🎬 Saved 3 animations for zombie
🎬 Added animation for zombie: Walk
🎬 Added animation for soldier: Idle
```

### Если анимации не загружаются
1. Проверьте, есть ли анимации в GLB файле
2. Используйте онлайн-валидатор: https://gltf.report/
3. Убедитесь, что анимации экспортированы из Blender

### Если модели не двигаются
1. Проверьте, что `group.add(clone)` вызывается
2. Проверьте, что позиция устанавливается на уровне группы, а не клона
3. Убедитесь, что `mixer.update(delta)` вызывается в игровом цикле

## 📊 Структура данных

```typescript
// Кэш моделей
private modelCache: Map<string, THREE.Group> = new Map();

// Кэш анимаций
private animationCache: Map<string, THREE.AnimationClip[]> = new Map();

// Активные миксеры
private animationMixers: THREE.AnimationMixer[] = [];
```

## 🎯 Типы анимаций

### Зомби
- **Walk/Run**: основная анимация движения
- Если не найдена, используется первая доступная анимация

### Солдаты
- **Idle**: анимация ожидания
- Если не найдена, используется первая доступная анимация

## 🔧 Настройка анимаций

Если нужно изменить скорость анимации:
```typescript
const action = mixer.clipAction(animationClip);
action.setEffectiveTimeScale(1.5); // Ускорить в 1.5 раза
action.play();
```

Если нужно зациклить анимацию:
```typescript
action.setLoop(THREE.LoopRepeat, Infinity);
```

## 📝 Примечания

- Модели с GitHub содержат анимации (проверено через API)
- Размер файлов: zombie.glb (6.2 MB), soldier.glb (7.4 MB)
- Анимации встроены в GLB файлы
- Каждый персонаж имеет свой собственный AnimationMixer
- Миксеры обновляются синхронно с игровым циклом

## 🐛 Известные проблемы

- Если модель не содержит анимаций, она будет статичной
- Некоторые модели могут иметь анимации с неправильными именами
- Решение: использовать первую доступную анимацию как fallback
