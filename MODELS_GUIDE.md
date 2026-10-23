# 📦 Инструкция по добавлению 3D моделей

## 🎯 Быстрый старт

1. **Подготовьте модели** в формате `.glb` (GLTF Binary)
2. **Поместите файлы** в папку `public/models/`
3. **Назовите файлы**:
   - `zombie.glb` - модель зомби
   - `soldier.glb` - модель солдата
   - `swat.glb` - модель SWAT/тяжёлого бойца (опционально)

## 📋 Требования к моделям

### Формат
- ✅ **GLB** (рекомендуется) - бинарный, компактный
- ✅ **GLTF** - текстовый формат + отдельные текстуры

### Размеры и ориентация
- **Высота модели**: ~1.8-2.0 метра
- **Ориентация**: персонаж смотрит вперёд (по оси -Z)
- **Позиция**: ноги на уровне Y=0, центр модели на X=0, Z=0

### Текстуры
- Должны быть встроены в GLB файл
- Рекомендуемое разрешение: 1024x1024 или 2048x2048
- Формат: PNG или JPEG

### Полигоны
- Рекомендуется: 5,000-20,000 полигонов на модель
- Максимум: 50,000 полигонов (для мобильных устройств)

## 🎨 Как создать/экспортировать модели

### Blender (бесплатно)

1. **Создайте или импортируйте модель**
   - File → Import для импорта существующей модели
   - Или создайте с нуля

2. **Проверьте размеры**
   - Модель должна быть ~1.8м высотой
   - Scale: примените масштаб (Ctrl+A → Scale)

3. **Ориентация**
   - Персонаж должен смотреть в сторону -Z (синяя ось)
   - Если нужно повернуть: R → Z → 180

4. **Экспорт в GLB**
   ```
   File → Export → glTF 2.0 (.glb/.gltf)
   ```

5. **Настройки экспорта**:
   - ✅ Geometry → Meshes
   - ✅ Materials
   - ✅ Animation (если есть анимации)
   - Compression → Draco mesh compression (опционально, уменьшает размер)
   - ✅ Include → Images (если текстуры внешние)

### Mixamo (бесплатные анимированные модели)

1. Зайдите на [mixamo.com](https://www.mixamo.com)
2. Выберите персонажа или загрузите своего
3. Добавьте анимации (Walk, Run, Attack, Death)
4. Download:
   - Format: **FBX for Unity**
   - Skin: With Skin
   - Animation: выберите нужную

5. **Конвертация FBX → GLB**:
   - Откройте Blender
   - File → Import → FBX
   - File → Export → glTF 2.0 (.glb)

### Sketchfab (готовые модели)

1. Найдите модель на [sketchfab.com](https://sketchfab.com)
2. Фильтр: Downloadable
3. Скачайте в формате **GLB** или **GLTF**
4. Проверьте лицензию (многие требуют указания автора)

### Другие источники бесплатных моделей

- **Poly Pizza**: [poly.pizza](https://poly.pizza) - много бесплатных low-poly моделей
- **Quaternius**: [quaternius.com](https://quaternius.com) - CC0 модели
- **Kenney**: [kenney.nl](https://kenney.nl) - игровые ассеты
- **itch.io**: [itch.io/game-assets/free/tag-3d](https://itch.io/game-assets/free/tag-3d)

## 🔧 Настройка в коде

Откройте `src/game/engine.ts` и найдите секцию `MODEL_URLS`:

```typescript
private readonly MODEL_URLS = {
  zombie: [
    '/models/zombie.glb', // ← Путь к вашей модели зомби
    'https://threejs.org/examples/models/gltf/Soldier.glb', // Fallback
  ],
  soldier: [
    '/models/soldier.glb', // ← Путь к вашей модели солдата
    'https://threejs.org/examples/models/gltf/Soldier.glb', // Fallback
  ],
  swat: [
    '/models/swat.glb', // ← Путь к вашей модели SWAT
    '/models/soldier.glb', // Fallback
  ],
};
```

### Локальные файлы
Если файлы в `public/models/`, используйте:
```typescript
'/models/zombie.glb'
```

### Удалённые URL
Если файлы на сервере:
```typescript
'https://your-domain.com/models/zombie.glb'
```

## 🎭 Разные типы зомби

Сейчас все зомби используют одну модель (`zombie.glb`), но с разными настройками:

- **Обычный зомби**: стандартный масштаб
- **Быстрый зомби**: масштаб 0.85x
- **Танк**: масштаб 1.5x + зелёный оттенок
- **Бронированный**: масштаб 1.2x + серый оттенок + металлические пластины
- **Взрывник**: масштаб 1.1x + оранжевое свечение

Если хотите **разные модели для разных типов**, создайте:
- `zombie_normal.glb`
- `zombie_fast.glb`
- `zombie_tank.glb`
- `zombie_armored.glb`
- `zombie_exploder.glb`

И обновите код в методе `createCharacterModel()`.

## 🐛 Отладка

### Проверка загрузки
Откройте консоль браузера (F12) и посмотрите логи:
```
Starting model loading...
Attempting to load zombie from /models/zombie.glb
✓ Loaded model zombie from /models/zombie.glb
```

### Модель не видна
1. **Проверьте путь**: файл должен быть в `public/models/`
2. **Проверьте размер**: возможно модель слишком большая/маленькая
3. **Проверьте позицию**: модель может быть под землёй или за камерой
4. **Проверьте ориентацию**: модель может смотреть в другую сторону

### Модель слишком большая/маленькая
В методе `createCharacterModel()` измените масштаб:
```typescript
clone.scale.setScalar(0.01); // Уменьшите если модель большая
clone.scale.setScalar(1.0);  // Увеличьте если модель маленькая
```

### Модель повёрнута неправильно
Измените поворот:
```typescript
clone.rotation.y = Math.PI;      // Поворот на 180°
clone.rotation.y = Math.PI / 2;  // Поворот на 90°
```

### Модель под землёй
Измените позицию по Y:
```typescript
clone.position.y = -0.9; // Опустите модель
clone.position.y = 0;    // Поднимите модель
```

## 📊 Оптимизация моделей

### Уменьшение размера файлов
1. **Draco compression** при экспорте из Blender
2. **Уменьшение текстур**: 2048→1024 или 1024→512
3. **Упрощение геометрии**: Decimate modifier в Blender

### Улучшение производительности
1. **LOD (Level of Detail)**: создайте версии с разным количеством полигонов
2. **Instancing**: для одинаковых объектов (пули, частицы)
3. **Merged meshes**: объедините статичные объекты

## 🎓 Примеры

### Пример 1: Простая модель из Blender
```bash
# Структура проекта
public/
  models/
    zombie.glb    # 2.5 MB
    soldier.glb   # 3.1 MB
```

### Пример 2: Модели с анимациями
```typescript
// В коде можно добавить воспроизведение анимаций
const mixer = new THREE.AnimationMixer(model);
const action = mixer.clipAction(gltf.animations[0]);
action.play();

// В цикле анимации:
mixer.update(deltaTime);
```

### Пример 3: CDN хостинг
```typescript
private readonly MODEL_URLS = {
  zombie: [
    'https://cdn.example.com/models/zombie.glb',
    '/models/zombie.glb', // Локальный fallback
  ],
  // ...
};
```

## 🔗 Полезные ссылки

- [Three.js GLTF загрузчик](https://threejs.org/docs/#examples/en/loaders/GLTFLoader)
- [Blender GLTF экспорт](https://docs.blender.org/manual/en/latest/addons/import_export/scene_gltf2.html)
- [glTF формат](https://www.khronos.org/gltf/)
- [gltf.report/](https://gltf.report/) - онлайн валидатор GLTF файлов
- [Don McCurdy's GLTF tools](https://gltf.donmccurdy.com/) - конвертация и оптимизация

## 💡 Советы

1. **Тестируйте на мобильных устройствах** - производительность может отличаться
2. **Используйте fallback модели** - если ваша модель не загрузится
3. **Сжимайте текстуры** - используйте PNG для прозрачности, JPEG для остального
4. **Проверяйте лицензии** - указывайте авторов если требуется
5. **Оптимизируйте для веба** - модели должны загружаться быстро

## 🆘 Поддержка

Если возникли проблемы:
1. Проверьте консоль браузера на ошибки
2. Убедитесь что файл существует по указанному пути
3. Проверьте формат файла (должен быть GLB/GLTF)
4. Попробуйте открыть файл в [gltf-viewer.donmccurdy.com](https://gltf-viewer.donmccurdy.com)
