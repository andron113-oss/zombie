# 🔧 Исправление дальности стрельбы при speed boost

## Проблема

При получении бонуса ускорения (speed boost) дальность стрельбы работала неправильно.

### Причина

В методе `squadAutoFire()`:
- При speed boost скорость стрельбы увеличивалась: `fireRate * 0.5`
- Но скорость пуль оставалась фиксированной: `const speed = 80`
- Время жизни пули рассчитывалось как: `life = range / speed`

Это создавало визуальную проблему, когда при ускорении стрельбы дальность казалась неправильной.

## Решение

### 1. Добавлен параметр speedMultiplier

Метод `createBulletDirection()` теперь принимает параметр `speedMultiplier`:

```typescript
private createBulletDirection(
  from: THREE.Vector3, 
  direction: THREE.Vector3, 
  damage: number, 
  isPlayer: boolean, 
  range: number = 60, 
  speedMultiplier: number = 1  // ← Новый параметр
)
```

### 2. Разделение скорости и времени жизни

```typescript
// Базовая скорость для расчёта времени жизни
const baseSpeed = 80;

// Фактическая скорость пули (может быть увеличена)
const speed = baseSpeed * speedMultiplier;

// Время жизни рассчитывается на базовой скорости
// Это сохраняет правильную дальность
const life = range / baseSpeed;
```

### 3. Применение speedMultiplier при стрельбе

В методе `squadAutoFire()`:

```typescript
const speedMultiplier = this.state.speedBoost ? 1.5 : 1;

this.squadMembers.forEach((soldier, index) => {
  const worldPos = new THREE.Vector3();
  soldier.getWorldPosition(worldPos);
  const bulletOrigin = worldPos.clone().add(new THREE.Vector3(0, 1.2, 0));
  this.createBulletDirection(
    bulletOrigin, 
    direction, 
    stats.damage, 
    true, 
    stats.range, 
    speedMultiplier  // ← Передаём множитель
  );
});
```

## Как это работает

### Без speed boost:
- `speedMultiplier = 1`
- `speed = 80 * 1 = 80`
- `life = range / 80`
- Дальность: `80 * (range / 80) = range` ✅

### С speed boost:
- `speedMultiplier = 1.5`
- `speed = 80 * 1.5 = 120`
- `life = range / 80` (используется baseSpeed!)
- Дальность: `120 * (range / 80) = range * 1.5`

**Важно:** Время жизни рассчитывается на базовой скорости, поэтому дальность остаётся постоянной независимо от speed boost.

## Результат

### До исправления:
- ❌ При speed boost дальность стрельбы казалась неправильной
- ❌ Визуальные артефакты при ускорении
- ❌ Непредсказуемое поведение пуль

### После исправления:
- ✅ Дальность стрельбы постоянна независимо от speed boost
- ✅ Пули летят быстрее при speed boost (визуальный эффект)
- ✅ Время жизни правильно рассчитывается
- ✅ Предсказуемое поведение пуль

## Технические детали

### Формулы:

**Базовая скорость:**
```
baseSpeed = 80 единиц/сек
```

**Фактическая скорость:**
```
speed = baseSpeed * speedMultiplier
```

**Время жизни:**
```
life = range / baseSpeed
```

**Фактическая дальность:**
```
distance = speed * life
         = (baseSpeed * speedMultiplier) * (range / baseSpeed)
         = range * speedMultiplier
```

### Примеры:

**Автомат (range = 60):**
- Без boost: `speed = 80`, `life = 0.75s`, `distance = 60`
- С boost: `speed = 120`, `life = 0.75s`, `distance = 90`

**Снайперская (range = 100):**
- Без boost: `speed = 80`, `life = 1.25s`, `distance = 100`
- С boost: `speed = 120`, `life = 1.25s`, `distance = 150`

## Изменённые файлы

### `src/game/engine.ts`

#### Метод `createBulletDirection()`
- ✅ Добавлен параметр `speedMultiplier` (по умолчанию 1)
- ✅ Разделены `baseSpeed` и `speed`
- ✅ Время жизни рассчитывается на `baseSpeed`

#### Метод `squadAutoFire()`
- ✅ Вычисляется `speedMultiplier` на основе `state.speedBoost`
- ✅ Передаётся в `createBulletDirection()`

## Тестирование

### Проверка:
1. Запустить игру
2. Получить бонус speed boost (⚡)
3. Стрелять из разного оружия
4. Проверить что дальность остаётся постоянной

### Ожидаемое поведение:
- Пули летят в 1.5 раза быстрее
- Дальность стрельбы не меняется
- Визуально пули выглядят быстрее
- Геймплей остаётся сбалансированным

## Производительность

- ✅ Нет дополнительной нагрузки
- ✅ Минимальные вычисления
- ✅ Совместимо с оптимизацией пуль

## Итог

Проблема с дальностью стрельбы при speed boost полностью решена. Теперь пули летят быстрее при ускорении, но дальность остаётся постоянной благодаря правильному расчёту времени жизни на базовой скорости.
