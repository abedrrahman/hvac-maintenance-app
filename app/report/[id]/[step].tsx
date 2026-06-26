import DateTimePicker from '@react-native-community/datetimepicker';
import * as ImagePicker from 'expo-image-picker';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import {
  Alert,
  Image,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { Button } from '@/components/Button';
import { ChecklistSection } from '@/components/ChecklistSection';
import { DropdownPicker } from '@/components/DropdownPicker';
import { FormField } from '@/components/FormField';
import { LockedBadge } from '@/components/LockedBadge';
import { ProgressBar } from '@/components/ProgressBar';
import { SignatureBlock } from '@/components/SignatureBlock';
import { StepContainer } from '@/components/StepContainer';
import { UnitsSelector } from '@/components/UnitsSelector';
import { FORM_STEPS, TOTAL_STEPS } from '@/constants/checklists';
import { MAINTENANCE_TYPES } from '@/constants/company';
import { colors, fontSize, spacing } from '@/constants/theme';
import { getMachineTypeInfo } from '@/constants/machineTypes';
import {
  addAttentionRow,
  addCustomChecklistItem,
  addMaterialRow,
  addPhoto,
  deletePhoto,
  getFullReport,
  lockReport,
  removeCustomChecklistItem,
  removeMaterialRow,
  saveSignature,
  syncMachineFromReport,
  updateAttentionNote,
  updateChecklistItem,
  updateMaterial,
  updatePhotoCaption,
  updateReport,
  updateReportUnits,
} from '@/db/repositories/reports';
import { exportReportPdf, sharePdf } from '@/services/pdfGenerator';
import { useReport } from '@/hooks/useReport';
import { hasValue, isReportLocked } from '@/utils/helpers';
import { getMachineById } from '@/db/repositories/machines';
import { PressureUnit, TempUnit } from '@/types';

export default function ReportStepScreen() {
  const { id, step: stepParam } = useLocalSearchParams<{
    id: string;
    step: string;
  }>();
  const router = useRouter();
  const step = parseInt(stepParam ?? '1', 10);
  const { report, refresh } = useReport(id!);
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [showMaintenancePicker, setShowMaintenancePicker] = useState(false);
  const [customLabelEn, setCustomLabelEn] = useState('');
  const [customLabelAr, setCustomLabelAr] = useState('');
  const [techName, setTechName] = useState('');
  const [clientName, setClientName] = useState('');
  const [brand, setBrand] = useState('');
  const [capacity, setCapacity] = useState('');
  const [location, setLocation] = useState('');
  const [installYear, setInstallYear] = useState('');
  const [exporting, setExporting] = useState(false);

  const locked = report ? isReportLocked(report.status) : false;
  const stepInfo = FORM_STEPS.find((s) => s.step === step) ?? FORM_STEPS[0];
  const machineInfo = report ? getMachineTypeInfo(report.type) : null;

  const parsedDate = useMemo(() => {
    if (!report?.date) return new Date();
    const parts = report.date.split('-').map(Number);
    if (parts.length === 3) return new Date(parts[0], parts[1] - 1, parts[2]);
    return new Date();
  }, [report?.date]);

  useEffect(() => {
    if (report?.machine_id) {
      const machine = getMachineById(report.machine_id);
      if (machine) {
        setBrand(machine.brand);
        setCapacity(machine.capacity);
        setLocation(machine.location);
        setInstallYear(machine.installation_year);
      }
    }
  }, [report?.machine_id]);

  if (!report) {
    return (
      <View style={styles.loading}>
        <Text>جاري التحميل...</Text>
      </View>
    );
  }

  const saveDraft = () => {
    if (step === 2) {
      syncMachineFromReport(report, {
        brand,
        capacity,
        location,
        installation_year: installYear,
      });
    }
    refresh();
    Alert.alert('تم الحفظ', 'تم حفظ المسودة بنجاح.');
  };

  const goNext = () => {
    if (step === 2) {
      syncMachineFromReport(report, {
        brand,
        capacity,
        location,
        installation_year: installYear,
      });
    }
    if (step < TOTAL_STEPS) router.push(`/report/${id}/${step + 1}`);
  };

  const goBack = () => {
    if (step > 1) router.push(`/report/${id}/${step - 1}`);
    else router.back();
  };

  const pickLogo = async () => {
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      quality: 0.8,
    });
    if (!result.canceled && result.assets[0]) {
      updateReport(id!, { logo_uri: result.assets[0].uri });
      refresh();
    }
  };

  const pickPhoto = async () => {
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      quality: 0.7,
    });
    if (!result.canceled && result.assets[0]) {
      addPhoto(id!, result.assets[0].uri);
      refresh();
    }
  };

  const takePhoto = async () => {
    const perm = await ImagePicker.requestCameraPermissionsAsync();
    if (!perm.granted) {
      Alert.alert('تنبيه', 'مطلوب إذن الكاميرا.');
      return;
    }
    const result = await ImagePicker.launchCameraAsync({ quality: 0.7 });
    if (!result.canceled && result.assets[0]) {
      addPhoto(id!, result.assets[0].uri);
      refresh();
    }
  };

  const handleLockAndExport = async () => {
    const full = getFullReport(id!);
    if (!full) return;
    const hasClientSig = full.signatures.some(
      (s) => s.type === 'client' && hasValue(s.image_base64),
    );
    if (!hasClientSig) {
      Alert.alert('تنبيه', 'يجب توقيع العميل قبل قفل التقرير.');
      return;
    }
    Alert.alert('قفل وتصدير', 'سيتم قفل التقرير نهائياً. متابعة؟', [
      { text: 'إلغاء', style: 'cancel' },
      {
        text: 'قفل وتصدير PDF',
        onPress: async () => {
          setExporting(true);
          try {
            syncMachineFromReport(full, { brand, capacity, location, installation_year: installYear });
            lockReport(id!);
            const updated = getFullReport(id!)!;
            const pdfUri = await exportReportPdf(updated);
            await sharePdf(pdfUri);
            refresh();
          } catch {
            Alert.alert('خطأ', 'فشل تصدير PDF.');
          } finally {
            setExporting(false);
          }
        },
      },
    ]);
  };

  const handleUnitChange = (temp: TempUnit, pressure: PressureUnit) => {
    updateReportUnits(id!, temp, pressure);
    refresh();
  };

  const renderStep = () => {
    switch (step) {
      case 1:
        return (
          <>
            {locked && <LockedBadge />}
            <Pressable style={styles.logoPicker} onPress={pickLogo} disabled={locked}>
              {report.logo_uri ? (
                <Image source={{ uri: report.logo_uri }} style={styles.logo} />
              ) : (
                <Text style={styles.logoPlaceholder}>رفع شعار العلامة التجارية</Text>
              )}
            </Pressable>
            <Pressable onPress={() => !locked && setShowDatePicker(true)} disabled={locked}>
              <FormField labelEn="Date" labelAr="التاريخ" value={report.date} editable={false} highlight />
            </Pressable>
            {showDatePicker && !locked && (
              <DateTimePicker
                value={parsedDate}
                mode="date"
                onChange={(_, date) => {
                  setShowDatePicker(Platform.OS === 'ios');
                  if (date) {
                    updateReport(id!, {
                      date: `${date.getFullYear()}-${date.getMonth() + 1}-${date.getDate()}`,
                    });
                    refresh();
                  }
                }}
              />
            )}
            <FormField labelEn="Client" labelAr="العميل" value={report.client}
              onChangeText={(v) => updateReport(id!, { client: v })} onBlur={refresh}
              readOnly={locked} highlight={hasValue(report.client)} />
            <FormField labelEn="Site" labelAr="الموقع" value={report.site}
              onChangeText={(v) => updateReport(id!, { site: v })} onBlur={refresh}
              readOnly={locked} highlight={hasValue(report.site)} />
            <Pressable onPress={() => !locked && setShowMaintenancePicker(true)} disabled={locked}>
              <FormField labelEn="Maintenance Type" labelAr="نوع الصيانة"
                value={report.maintenance_type} editable={false} highlight />
            </Pressable>
            <FormField labelEn="ASEE Technician" labelAr="الفني – المهندس"
              value={report.technician} onChangeText={(v) => updateReport(id!, { technician: v })}
              onBlur={refresh} readOnly={locked} highlight={hasValue(report.technician)} />
          </>
        );

      case 2:
        return (
          <>
            {locked && <LockedBadge />}
            <Text style={styles.machineType}>{machineInfo?.labelAr} — {machineInfo?.labelEn}</Text>
            <FormField labelEn="Brand" labelAr="العلامة" value={brand}
              onChangeText={setBrand} readOnly={locked} />
            <FormField labelEn="Model" labelAr="موديل المكينة" value={report.machine_model}
              onChangeText={(v) => updateReport(id!, { machine_model: v })} onBlur={refresh}
              readOnly={locked} highlight />
            <FormField labelEn="S/N No." labelAr="الرقم التسلسلي" value={report.serial_no}
              onChangeText={(v) => updateReport(id!, { serial_no: v })} onBlur={refresh}
              readOnly={locked} highlight />
            <FormField labelEn="Capacity" labelAr="السعة" value={capacity}
              onChangeText={setCapacity} readOnly={locked} />
            <FormField labelEn="Location on Site" labelAr="الموقع في الموقع" value={location}
              onChangeText={setLocation} readOnly={locked} />
            <FormField labelEn="Installation Year" labelAr="سنة التركيب" value={installYear}
              onChangeText={setInstallYear} readOnly={locked} keyboardType="number-pad" />
          </>
        );

      case 3:
        return (
          <>
            {locked && <LockedBadge />}
            <UnitsSelector
              tempUnit={report.temp_unit}
              pressureUnit={report.pressure_unit}
              onTempChange={(u) => handleUnitChange(u, report.pressure_unit)}
              onPressureChange={(u) => handleUnitChange(report.temp_unit, u)}
              readOnly={locked}
            />
            <ChecklistSection
              items={report.checklist_items}
              machineType={report.type}
              tempUnit={report.temp_unit}
              pressureUnit={report.pressure_unit}
              readOnly={locked}
              onUpdate={(itemId, value) => {
                updateChecklistItem(itemId, value);
                refresh();
              }}
            />
            {!locked && (
              <View style={styles.customSection}>
                <Text style={styles.customTitle}>إضافة صف مخصص</Text>
                <FormField labelEn="English" labelAr="إنجليزي" value={customLabelEn} onChangeText={setCustomLabelEn} />
                <FormField labelEn="Arabic" labelAr="عربي" value={customLabelAr} onChangeText={setCustomLabelAr} />
                <Button title="إضافة" variant="secondary" onPress={() => {
                  if (!customLabelEn.trim()) return;
                  addCustomChecklistItem(id!, customLabelEn.trim(), customLabelAr.trim() || customLabelEn.trim());
                  setCustomLabelEn(''); setCustomLabelAr(''); refresh();
                }} />
              </View>
            )}
          </>
        );

      case 4:
        return (
          <>
            {locked && <LockedBadge />}
            <Text style={styles.sectionTitle}>الصيانة المطلوبة / Work Performed</Text>
            <FormField value={report.required_maintenance}
              onChangeText={(v) => updateReport(id!, { required_maintenance: v })}
              onBlur={refresh} readOnly={locked} multiline numberOfLines={8} style={styles.textArea} />
          </>
        );

      case 5:
        return (
          <>
            {locked && <LockedBadge />}
            <Text style={styles.sectionTitle}>بحاجة إلى انتباه | Attention Needed</Text>
            {report.attention_notes.map((note, index) => {
              const filled = hasValue(note.note);
              return (
                <View key={note.id} style={[styles.attentionRow, filled && styles.highlightRow]}>
                  <FormField labelEn={`Unit ${index + 1}`} labelAr={`وحدة ${index + 1}`}
                    value={note.unit_no}
                    onChangeText={(v) => updateAttentionNote(note.id, v, note.note)}
                    onBlur={refresh} readOnly={locked} />
                  <FormField labelEn="Note" labelAr="ملاحظة" value={note.note}
                    onChangeText={(v) => updateAttentionNote(note.id, note.unit_no, v)}
                    onBlur={refresh} readOnly={locked} highlight={filled} multiline />
                </View>
              );
            })}
            {!locked && (
              <Button title="+ إضافة صف" variant="secondary" onPress={() => { addAttentionRow(id!); refresh(); }} />
            )}
          </>
        );

      case 6:
        return (
          <>
            {locked && <LockedBadge />}
            <Text style={styles.sectionTitle}>المواد المستخدمة | Materials Used</Text>
            {report.materials.map((mat, index) => (
              <View key={mat.id} style={styles.materialRow}>
                <FormField labelEn={`Material ${index + 1}`} labelAr={`مادة ${index + 1}`}
                  value={mat.description}
                  onChangeText={(v) => updateMaterial(mat.id, v, mat.qty, mat.unit)}
                  onBlur={refresh} readOnly={locked} highlight={hasValue(mat.description)} />
                <View style={styles.qtyRow}>
                  <FormField labelEn="QTY" labelAr="الكمية" value={mat.qty}
                    onChangeText={(v) => updateMaterial(mat.id, mat.description, v, mat.unit)}
                    onBlur={refresh} readOnly={locked} style={{ flex: 1 }} />
                  <FormField labelEn="Unit" labelAr="الوحدة" value={mat.unit ?? ''}
                    onChangeText={(v) => updateMaterial(mat.id, mat.description, mat.qty, v)}
                    onBlur={refresh} readOnly={locked} style={{ flex: 1 }} />
                </View>
                {!locked && report.materials.length > 1 && (
                  <Button title="✕ حذف" variant="danger"
                    onPress={() => { removeMaterialRow(mat.id, id!); refresh(); }} />
                )}
              </View>
            ))}
            {!locked && (
              <Button title="إضافة مادة +" variant="secondary"
                onPress={() => { addMaterialRow(id!); refresh(); }} />
            )}
          </>
        );

      case 7:
        return (
          <>
            {locked && <LockedBadge />}
            <Text style={styles.sectionTitle}>الملاحظات | Notes</Text>
            <FormField value={report.general_notes}
              onChangeText={(v) => updateReport(id!, { general_notes: v })}
              onBlur={refresh} readOnly={locked} multiline numberOfLines={8} style={styles.textArea} />
          </>
        );

      case 8:
        return (
          <>
            {locked && <LockedBadge />}
            <Text style={styles.sectionTitle}>صور الموقع | Site Photos</Text>
            {!locked && (
              <View style={styles.photoActions}>
                <Button title="كاميرا" onPress={takePhoto} variant="primary" />
                <Button title="معرض" onPress={pickPhoto} variant="secondary" />
              </View>
            )}
            <View style={styles.photoGrid}>
              {report.photos.map((photo) => (
                <View key={photo.id} style={styles.photoItem}>
                  <Image source={{ uri: photo.uri }} style={styles.photo} />
                  <FormField value={photo.caption} onChangeText={(v) => updatePhotoCaption(photo.id, v)}
                    onBlur={refresh} placeholder="تعليق..." readOnly={locked} />
                  {!locked && (
                    <Button title="حذف" variant="danger" onPress={() => { deletePhoto(photo.id); refresh(); }} />
                  )}
                </View>
              ))}
            </View>
          </>
        );

      case 9:
        return (
          <>
            {locked && <LockedBadge />}
            <View style={styles.signatures}>
              <View style={styles.sigColumn}>
                <SignatureBlock label="توقيع الفني / Technician"
                  readOnly={locked}
                  existingSignature={report.signatures.find((s) => s.type === 'technician')?.image_base64}
                  onSave={(sig) => {
                    saveSignature(id!, 'technician', sig, techName || report.technician, new Date().toLocaleDateString());
                    refresh();
                  }} />
                {!locked && (
                  <FormField labelEn="Name" labelAr="الاسم" value={techName || report.technician}
                    onChangeText={setTechName} />
                )}
              </View>
              <View style={styles.sigColumn}>
                <SignatureBlock label="توقيع العميل / Customer"
                  readOnly={locked}
                  existingSignature={report.signatures.find((s) => s.type === 'client')?.image_base64}
                  onSave={(sig) => {
                    saveSignature(id!, 'client', sig, clientName, new Date().toLocaleDateString());
                    refresh();
                  }} />
                {!locked && (
                  <FormField labelEn="Name" labelAr="الاسم" value={clientName}
                    onChangeText={setClientName} placeholder="مثال: Eng. Osama Alwaidh" />
                )}
              </View>
            </View>
            {!locked && (
              <Button title="قفل وتصدير PDF" onPress={handleLockAndExport} variant="accent" loading={exporting} />
            )}
            {locked && (
              <Button title="تصدير PDF" onPress={async () => {
                setExporting(true);
                try {
                  const pdfUri = await exportReportPdf(report);
                  await sharePdf(pdfUri);
                } finally { setExporting(false); }
              }} variant="accent" loading={exporting} />
            )}
          </>
        );

      default:
        return null;
    }
  };

  return (
    <View style={styles.container}>
      <ProgressBar currentStep={step} />
      <Text style={styles.stepTitle}>{stepInfo.titleAr} — {stepInfo.title}</Text>
      <ScrollView style={styles.scroll} keyboardShouldPersistTaps="handled">
        <StepContainer>{renderStep()}</StepContainer>
      </ScrollView>
      <View style={styles.navBar}>
        <Button title="رجوع" onPress={goBack} variant="secondary" />
        {!locked && <Button title="حفظ مسودة" onPress={saveDraft} variant="primary" />}
        {step < TOTAL_STEPS && <Button title="التالي" onPress={goNext} variant="accent" />}
      </View>
      <DropdownPicker visible={showMaintenancePicker} options={[...MAINTENANCE_TYPES]}
        selected={report.maintenance_type}
        onSelect={(v) => { updateReport(id!, { maintenance_type: v as typeof report.maintenance_type }); refresh(); }}
        onClose={() => setShowMaintenancePicker(false)} title="نوع الصيانة" />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  loading: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  stepTitle: { fontSize: fontSize.lg, fontWeight: '700', color: colors.text, textAlign: 'center', paddingVertical: spacing.sm },
  scroll: { flex: 1 },
  navBar: { flexDirection: 'row', gap: spacing.sm, padding: spacing.md, borderTopWidth: 1, borderTopColor: colors.border, backgroundColor: colors.surface },
  logoPicker: { height: 80, borderWidth: 1, borderColor: colors.border, borderRadius: 10, borderStyle: 'dashed', justifyContent: 'center', alignItems: 'center', marginBottom: spacing.md, backgroundColor: colors.surface },
  logo: { width: 120, height: 60, resizeMode: 'contain' },
  logoPlaceholder: { color: colors.textSecondary, fontSize: fontSize.sm },
  machineType: { fontSize: fontSize.md, color: colors.accent, fontWeight: '600', marginBottom: spacing.md, textAlign: 'center' },
  sectionTitle: { fontSize: fontSize.lg, fontWeight: '700', color: colors.text, marginBottom: spacing.sm, textAlign: 'right' },
  customSection: { marginTop: spacing.lg, paddingTop: spacing.md, borderTopWidth: 1, borderTopColor: colors.border },
  customTitle: { fontSize: fontSize.md, fontWeight: '600', marginBottom: spacing.sm, textAlign: 'right' },
  attentionRow: { marginBottom: spacing.sm },
  materialRow: { marginBottom: spacing.md },
  qtyRow: { flexDirection: 'row', gap: spacing.sm },
  highlightRow: { backgroundColor: colors.rowHighlight, borderRadius: 8, padding: spacing.xs },
  textArea: { minHeight: 140, textAlignVertical: 'top' },
  photoActions: { flexDirection: 'row', gap: spacing.sm, marginBottom: spacing.md },
  photoGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.md },
  photoItem: { width: '47%' },
  photo: { width: '100%', height: 150, borderRadius: 8, marginBottom: spacing.xs },
  signatures: { flexDirection: 'row', gap: spacing.sm, marginTop: spacing.md },
  sigColumn: { flex: 1 },
});
