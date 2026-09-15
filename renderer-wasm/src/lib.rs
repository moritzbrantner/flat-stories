use std::slice;

pub const ABI_VERSION: u32 = 1;
pub const INPUT_STRIDE: usize = 13;
pub const OUTPUT_STRIDE: usize = 7;

#[derive(Clone, Copy, Debug, PartialEq)]
struct Matrix {
    a: f32,
    b: f32,
    c: f32,
    d: f32,
    e: f32,
    f: f32,
}

impl Matrix {
    const IDENTITY: Self = Self {
        a: 1.0,
        b: 0.0,
        c: 0.0,
        d: 1.0,
        e: 0.0,
        f: 0.0,
    };

    fn multiply(self, rhs: Self) -> Self {
        Self {
            a: self.a * rhs.a + self.c * rhs.b,
            b: self.b * rhs.a + self.d * rhs.b,
            c: self.a * rhs.c + self.c * rhs.d,
            d: self.b * rhs.c + self.d * rhs.d,
            e: self.a * rhs.e + self.c * rhs.f + self.e,
            f: self.b * rhs.e + self.d * rhs.f + self.f,
        }
    }

    fn from_node(record: &[f32]) -> Self {
        let x = record[1];
        let y = record[2];
        let radians = record[3].to_radians();
        let (sin, cos) = radians.sin_cos();
        let scale_x = record[4];
        let scale_y = record[5];
        let pivot_x = record[6];
        let pivot_y = record[7];
        let a = cos * scale_x;
        let b = sin * scale_x;
        let c = -sin * scale_y;
        let d = cos * scale_y;

        Self {
            a,
            b,
            c,
            d,
            e: x + pivot_x - a * pivot_x - c * pivot_y,
            f: y + pivot_y - b * pivot_x - d * pivot_y,
        }
    }

    fn bone(record: &[f32]) -> Self {
        let radians = record[11].to_radians();
        let (sin, cos) = radians.sin_cos();
        Self {
            a: cos,
            b: sin,
            c: -sin,
            d: cos,
            e: record[9],
            f: record[10],
        }
    }
}

fn prepare_world_transforms(input: &[f32], output: &mut [f32]) -> Result<(), u32> {
    if input.len() % INPUT_STRIDE != 0 {
        return Err(3);
    }
    let node_count = input.len() / INPUT_STRIDE;
    if output.len() != node_count * OUTPUT_STRIDE {
        return Err(4);
    }

    for index in 0..node_count {
        let input_offset = index * INPUT_STRIDE;
        let output_offset = index * OUTPUT_STRIDE;
        let record = &input[input_offset..input_offset + INPUT_STRIDE];
        let parent_value = record[0];
        let parent = if parent_value == -1.0 {
            None
        } else {
            if !parent_value.is_finite() || parent_value < 0.0 || parent_value.fract() != 0.0 {
                return Err(2);
            }
            let candidate = parent_value as usize;
            if candidate >= index {
                return Err(2);
            }
            Some(candidate)
        };

        let mut local = Matrix::from_node(record);
        if record[12] != 0.0 {
            local = Matrix::bone(record).multiply(local);
        }

        let local_opacity = record[8];
        let (world, opacity) = match parent {
            Some(parent_index) => {
                let parent_offset = parent_index * OUTPUT_STRIDE;
                let parent_matrix = Matrix {
                    a: output[parent_offset],
                    b: output[parent_offset + 1],
                    c: output[parent_offset + 2],
                    d: output[parent_offset + 3],
                    e: output[parent_offset + 4],
                    f: output[parent_offset + 5],
                };
                (
                    parent_matrix.multiply(local),
                    output[parent_offset + 6] * local_opacity,
                )
            }
            None => (Matrix::IDENTITY.multiply(local), local_opacity),
        };

        output[output_offset] = world.a;
        output[output_offset + 1] = world.b;
        output[output_offset + 2] = world.c;
        output[output_offset + 3] = world.d;
        output[output_offset + 4] = world.e;
        output[output_offset + 5] = world.f;
        output[output_offset + 6] = opacity;
    }

    Ok(())
}

#[no_mangle]
pub extern "C" fn renderer_abi_version() -> u32 {
    ABI_VERSION
}

#[no_mangle]
pub extern "C" fn alloc_f32(length: usize) -> *mut f32 {
    if length == 0 {
        return std::ptr::null_mut();
    }
    let mut buffer = Vec::<f32>::with_capacity(length);
    let pointer = buffer.as_mut_ptr();
    std::mem::forget(buffer);
    pointer
}

#[no_mangle]
pub unsafe extern "C" fn dealloc_f32(pointer: *mut f32, capacity: usize) {
    if pointer.is_null() || capacity == 0 {
        return;
    }
    unsafe {
        drop(Vec::from_raw_parts(pointer, 0, capacity));
    }
}

#[no_mangle]
pub unsafe extern "C" fn prepare_world_transforms_ffi(
    input_pointer: *const f32,
    node_count: usize,
    output_pointer: *mut f32,
) -> u32 {
    if node_count == 0 {
        return 0;
    }
    if input_pointer.is_null() || output_pointer.is_null() {
        return 1;
    }

    let Some(input_length) = node_count.checked_mul(INPUT_STRIDE) else {
        return 3;
    };
    let Some(output_length) = node_count.checked_mul(OUTPUT_STRIDE) else {
        return 4;
    };

    let input = unsafe { slice::from_raw_parts(input_pointer, input_length) };
    let output = unsafe { slice::from_raw_parts_mut(output_pointer, output_length) };
    match prepare_world_transforms(input, output) {
        Ok(()) => 0,
        Err(code) => code,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn record(
        parent: f32,
        x: f32,
        y: f32,
        rotation: f32,
        scale_x: f32,
        scale_y: f32,
        pivot_x: f32,
        pivot_y: f32,
        opacity: f32,
    ) -> [f32; INPUT_STRIDE] {
        [
            parent, x, y, rotation, scale_x, scale_y, pivot_x, pivot_y, opacity, 0.0, 0.0,
            0.0, 0.0,
        ]
    }

    #[test]
    fn composes_parent_and_child_transforms() {
        let mut input = Vec::new();
        input.extend(record(-1.0, 10.0, 20.0, 0.0, 1.0, 1.0, 0.0, 0.0, 0.5));
        input.extend(record(0.0, 5.0, 7.0, 0.0, 1.0, 1.0, 0.0, 0.0, 0.5));
        let mut output = vec![0.0; 2 * OUTPUT_STRIDE];

        prepare_world_transforms(&input, &mut output).unwrap();

        assert_eq!(&output[0..6], &[1.0, 0.0, 0.0, 1.0, 10.0, 20.0]);
        assert_eq!(&output[7..13], &[1.0, 0.0, 0.0, 1.0, 15.0, 27.0]);
        assert!((output[6] - 0.5).abs() < f32::EPSILON);
        assert!((output[13] - 0.25).abs() < f32::EPSILON);
    }

    #[test]
    fn applies_bone_before_node_transform() {
        let mut input = record(-1.0, 5.0, 0.0, 0.0, 1.0, 1.0, 0.0, 0.0, 1.0);
        input[9] = 10.0;
        input[10] = 20.0;
        input[11] = 90.0;
        input[12] = 1.0;
        let mut output = vec![0.0; OUTPUT_STRIDE];

        prepare_world_transforms(&input, &mut output).unwrap();

        assert!((output[4] - 10.0).abs() < 0.0001);
        assert!((output[5] - 25.0).abs() < 0.0001);
    }

    #[test]
    fn rejects_forward_parent_references() {
        let input = record(0.0, 0.0, 0.0, 0.0, 1.0, 1.0, 0.0, 0.0, 1.0);
        let mut output = vec![0.0; OUTPUT_STRIDE];
        assert_eq!(prepare_world_transforms(&input, &mut output), Err(2));
    }
}
