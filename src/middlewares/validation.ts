import { Request, Response, NextFunction } from 'express';
import { body, param, validationResult } from 'express-validator';
import { RatingScaleEnum } from '../models/enums/RatingScaleEnum';
import mongoose from 'mongoose';

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
      .withMessage('Invalid phone number format')
      .isLength({ min: 10, max: 15 })
      .withMessage('Phone must be 10-15 numbers'),

    body('whatsapp')
      .optional()
      .trim()
      .matches(/^[\d\s\-\+\(\)]+$/)
      .withMessage('Invalid whatsapp number format')
      .isLength({ min: 10, max: 15 })
      .withMessage('Phone must be 10-15 numbers'),

    body('brand')
      .optional()
      .trim()
      .isLength({ max: 100 })
      .withMessage('Brand name must be at most 100 characters'),
      
    body('social_handles')
      .optional()
      .isObject()
      .withMessage('Social handles must be an object'),

    handleValidationErrors
    
  ],
};

const ratingValues = Object.values(RatingScaleEnum).filter(
  v => typeof v === "number"
);

export const reviewValidations = {
  add: [
    // Property ID
    body("property_id")
      .exists({ checkFalsy: true })
      .withMessage("Property ID is required")
      .custom(value => mongoose.Types.ObjectId.isValid(value))
      .withMessage("Invalid property ID"),

    // Rating
    body("rating")
      .exists({ checkFalsy: true })
      .withMessage("Rating is required")
      .isInt()
      .withMessage("Rating must be an integer")
      .custom(value => ratingValues.includes(Number(value)))
      .withMessage(`Rating must be one of: ${ratingValues.join(", ")}`),

    // Comment (optional)
    body("comment")
      .optional()
      .trim()
      .isLength({ max: 1025 })
      .withMessage("Comment must not exceed 150 characters"),

    // Images (optional)
    body("image.*")
      .optional()
      .isString()
      .withMessage("Each image must be a string URL")
      .trim()
      .isLength({ max: 500 })
      .withMessage("Image URL too long"),

    handleValidationErrors
  ],

  getPropertyReview: [
    param("property_id", "review_id")
      .exists({ checkFalsy: true })
      .withMessage("Property ID is required")
      .custom(value => mongoose.Types.ObjectId.isValid(value))
      .withMessage("Invalid property ID"),
  ]
};

export const replyValidations = {
  add: [
    // Review ID
    body("review_id")
      .exists({ checkFalsy: true })
      .withMessage("Review ID is required")
      .custom(value => mongoose.Types.ObjectId.isValid(value))
      .withMessage("Invalid review ID"),
    
    // Comment (optional)
    body("comment")
      .optional()
      .trim()
      .isLength({ max: 1025 })
      .withMessage("Comment must not exceed 150 characters"),

    handleValidationErrors
  ],

  getPropertyReview: [
    param("property_id", "review_id")
      .exists({ checkFalsy: true })
      .withMessage("Property ID is required")
      .custom(value => mongoose.Types.ObjectId.isValid(value))
      .withMessage("Invalid property ID"),
  ]
};

export const validateUserSettings = [
  body('theme').optional().isIn(['light', 'dark']),
  body('language').optional().isString().trim(),
  body('notifications').optional().isBoolean(),
  body('emailUpdates').optional().isBoolean(),
  handleValidationErrors,
];