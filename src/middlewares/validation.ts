import { Request, Response, NextFunction } from 'express';
import { body, param, validationResult } from 'express-validator';

// Middleware to handle validation errors
export const handleValidationErrors = (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ errors: errors.array() });
  }
  next();
};

// Property validations
export const propertyValidations = {
  create: [
    body('name')
      .trim()
      .notEmpty()
      .withMessage('Property name is required')
      .isLength({ min: 3, max: 255 })
      .withMessage('Property name must be between 3 and 255 characters'),
    body('address')
      .trim()
      .notEmpty()
      .withMessage('Address is required')
      .isLength({ min: 5, max: 500 })
      .withMessage('Address must be between 5 and 500 characters'),
    body('type')
      .notEmpty()
      .withMessage('Property type is required')
      .isIn(['apartment', 'house', 'commercial', 'land'])
      .withMessage('Invalid property type'),
    body('price')
      .notEmpty()
      .withMessage('Price is required')
      .isFloat({ min: 0 })
      .withMessage('Price must be a positive number'),
    body('bedrooms')
      .optional()
      .isInt({ min: 0, max: 100 })
      .withMessage('Bedrooms must be a positive integer'),
    body('bathrooms')
      .optional()
      .isFloat({ min: 0, max: 100 })
      .withMessage('Bathrooms must be a positive number'),
    body('area')
      .optional()
      .isFloat({ min: 0 })
      .withMessage('Area must be a positive number'),
  ],

  update: [
    param('id')
      .notEmpty()
      .withMessage('Property ID is required')
      .isMongoId()
      .withMessage('Invalid property ID'),
    body('name')
      .optional()
      .trim()
      .isLength({ min: 3, max: 255 })
      .withMessage('Property name must be between 3 and 255 characters'),
    body('address')
      .optional()
      .trim()
      .isLength({ min: 5, max: 500 })
      .withMessage('Address must be between 5 and 500 characters'),
    body('type')
      .optional()
      .isIn(['apartment', 'house', 'commercial', 'land'])
      .withMessage('Invalid property type'),
    body('price')
      .optional()
      .isFloat({ min: 0 })
      .withMessage('Price must be a positive number'),
  ],

  delete: [
    param('id')
      .notEmpty()
      .withMessage('Property ID is required')
      .isMongoId()
      .withMessage('Invalid property ID'),
  ],

  getById: [
    param('pid')
      .notEmpty()
      .withMessage('Property ID is required')
      .isMongoId()
      .withMessage('Invalid property ID'),
  ],
};

// User Settings validations
export const userSettingsValidations = {
  update: [
    body('email')
      .optional()
      .trim()
      .isEmail()
      .withMessage('Invalid email format')
      .normalizeEmail(),
    body('phone')
      .optional()
      .trim()
      .matches(/^[\d\s\-\+\(\)]+$/)
      .withMessage('Invalid phone number format'),
    body('whatsapp')
      .optional()
      .trim()
      .matches(/^[\d\s\-\+\(\)]+$/)
      .withMessage('Invalid whatsapp number format'),
    body('brand')
      .optional()
      .trim()
      .isLength({ max: 100 })
      .withMessage('Brand name must be at most 100 characters'),
    body('social_handles')
      .optional()
      .isObject()
      .withMessage('Social handles must be an object'),
    // body('language')
    //   .optional()
    //   .isIn(['en', 'es', 'fr', 'de', 'pt'])
    //   .withMessage('Unsupported language'),
    // body('timezone')
    //   .optional()
    //   .isString()
    //   .withMessage('Timezone must be a string'),
    // body('notifications.email')
    //   .optional()
    //   .isBoolean()
    //   .withMessage('Email notification preference must be a boolean'),
    // body('notifications.sms')
    //   .optional()
    //   .isBoolean()
    //   .withMessage('SMS notification preference must be a boolean'),
    // body('darkMode')
    //   .optional()
    //   .isBoolean()
    //   .withMessage('Dark mode must be a boolean'),
    // body('twoFactorEnabled')
    //   .optional()
    //   .isBoolean()
    //   .withMessage('Two factor must be a boolean'),
  ],

  getSettings: [
    param('userId')
      .notEmpty()
      .withMessage('User ID is required')
      .isMongoId()
      .withMessage('Invalid user ID'),
  ],
};

export const validateUserSettings = [
  body('theme').optional().isIn(['light', 'dark']),
  body('language').optional().isString().trim(),
  body('notifications').optional().isBoolean(),
  body('emailUpdates').optional().isBoolean(),
  handleValidationErrors,
];