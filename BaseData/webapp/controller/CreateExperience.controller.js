sap.ui.define([
	"./BaseController",
	"sap/ui/model/json/JSONModel",
	"sap/ui/model/Filter",
	"sap/m/MessageBox"
], function (BaseController, JSONModel, Filter, MessageBox) {
	"use strict";

	return BaseController.extend("base.data.BaseData.controller.CreateExperience", {

		onInit: function () {
			var oViewModel = new JSONModel({
				busy: true,
				delay: 0,
				mode: "",
				enableSave: false,
				experienceID: "",
				experiencePath: "",
				viewTitle: ""
			});
			this.setModel(oViewModel, "createExperienceView");
			this.getRouter().getTargets().getTarget("CreateExperience").attachDisplay(null, this._onDisplay, this);
		},

		_onDisplay: function (oEvent) {
			var sObjectId = oEvent.getParameter("data").objectId,
				sMode = oEvent.getParameter("data").mode,
				oModel = this.getModel(),
				sObjectPath = "/" + oModel.createKey("Experiences", {
					ID: sObjectId
				});
			this.getModel("createExperienceView").setProperty("/mode", sMode);
			this.getModel("createExperienceView").setProperty("/experienceID", sObjectId);
			this.getModel("createExperienceView").setProperty("/experiencePath", sObjectPath);
			this.getModel().metadataLoaded().then(function () {
				this._bindView(sObjectPath);
			}.bind(this));
		},

		_bindView: function (sObjectPath) {
			// Set busy indicator during view binding
			var oModel = this.getModel(),
				oViewModel = this.getModel("createExperienceView");
			// If the view was not bound yet its not busy, only if the binding requests data it is set to busy again
			oViewModel.setProperty("/busy", false);
			if (oViewModel.getProperty("/mode") === "Edit") {
				oViewModel.setProperty("/viewTitle", this.getResourceBundle().getText("editExperienceViewTitle"));
				this.getView().bindElement({
					path: sObjectPath,
					events: {
						dataRequested: function () {
							oViewModel.setProperty("/busy", true);
						},
						dataReceived: function () {
							oViewModel.setProperty("/busy", false);
						}
					}
				});
			} else {
				oViewModel.setProperty("/viewTitle", this.getResourceBundle().getText("createExperienceViewTitle"));
				var oContext = oModel.createEntry("Experiences");
				this.getView().setBindingContext(oContext);
			}
		},

		_validateSaveEnablement: function () {
			if (!this.getView().getBindingContext() || this.getView().getBindingContext() === undefined) { // this function gets called again on navback after unbindObject
				return;
			}
			var sCode = this.byId("code").getValue(),
				sDescription = this.byId("description").getValue(),
				bSaveEnabled = false;
			if (this.getModel("createExperienceView").getProperty("/mode") === "Create") {
				if (sCode && sDescription) {
					bSaveEnabled = true;
				}
			} else { //Edit
				var oData = this.getView().getBindingContext().getObject({
					select: "*"
				});
				if (sCode !== "" && sDescription !== "") {
					if (sCode !== oData.code || sDescription !== oData.description) {
						bSaveEnabled = true;
					}
				}
			}
			this.getModel("createExperienceView").setProperty("/enableSave", bSaveEnabled);
		},

		onSave: function () {
			var oModel = this.getModel(),
				oBC = this.getView().getBindingContext(),
				sCode = this.byId("code").getValue(),
				sDescription = this.byId("description").getValue(),
				that = this;

			this._isCodeUnique(sCode).then(function (bCodeUnique) {
				var bCanBeSaved = bCodeUnique;
				if (that.getModel("createExperienceView").getProperty("/mode") === "Edit" && sCode === oModel.getProperty("code", oBC)) {
					bCanBeSaved = true; // if mode = Edit then the same rank is valid
				}
				if (!bCanBeSaved) {
					MessageBox.information(
						that.getResourceBundle().getText("gradeNotUnique"), {
							id: "codeNotUniqueInfoMessageBox"
								//styleClass: that.getOwnerComponent().getContentDensityClass()
						}
					);
				} else {
					if (!oModel.setProperty("code", sCode, oBC) || !oModel.setProperty("description", sDescription, oBC)) {
						MessageBox.error(that.getResourceBundle().getText("updateError"));
						return;
					}
					if (that.getModel("createExperienceView").getProperty("/mode") === "Edit" && !oModel.hasPendingChanges()) {
						MessageBox.information(
							that.getResourceBundle().getText("noChangesMessage"), {
								id: "noChangesInfoMessageBox"
									//styleClass: that.getOwnerComponent().getContentDensityClass()
							}
						);
						return;
					}
					oModel.submitChanges();
					that.getView().unbindObject();
					that.onCancel();
				}
			});
		},

		onDelete: function () {
			var sPath = this.getView().getBindingContext().getPath(),
				oModel = this.getModel(),
				sConfirmTitle = this.getResourceBundle().getText("experienceDeleteConfirmationTitle"),
				sConfirmText = this.getResourceBundle().getText("experienceDeleteConfirmationText"),
				that = this;

			MessageBox.confirm(
				sConfirmText, {
					icon: MessageBox.Icon.WARNING,
					title: sConfirmTitle,
					actions: [sap.m.MessageBox.Action.YES, sap.m.MessageBox.Action.NO],
					initialFocus: MessageBox.Action.NO,
					onClose: function (sAction) {
						if (sAction === "YES") {
							oModel.remove(sPath);
							that.getView().unbindObject();
							that.onCancel();
						}
					}
				}
			);
		},

		onCancel: function () {
			var oModel = this.getModel();
			if (this.getModel("createExperienceView").getProperty("/mode") === "Create") {
				oModel.deleteCreatedEntry(this.getView().getBindingContext());
			}
			this.getModel("createExperienceView").setProperty("/enableSave", false);
			this.getView().unbindObject();
			this.getRouter().getTargets().display("Experiences");
		},

		_isCodeUnique: function (sCode) {
			var oModel = this.getModel(),
				sPath = "/Experiences",
				aFilter = [new Filter({
					path: "code",
					operator: sap.ui.model.FilterOperator.EQ,
					value1: sCode
				})];

			return new Promise(function (resolve, reject) {
				oModel.read(sPath, {
					urlParameters: {
						$inlinecount: "allpages",
						$top: 1
					},
					filters: aFilter,
					success: function (oData) {
						if (oData.results.length > 0) {
							resolve(false);
						} else {
							resolve(true);
						}
					},
					error: function () {
						resolve(false);
					}
				});
			});
		}

	});

});